-- 078 MDC · Pessoal: correções da auditoria em 5 níveis de 14/11/2026 (docs/auditoria/2026-11-14-parecer.md).
--
-- O ponto de fundo (SEG-01, SEG-02, SEG-03, BD-01): quem se cadastra pela internet vira administrador da própria família,
-- e funções antigas do HUB tomavam "administrador" ou "empresa da Gestão" como prova de equipe da MDC. Esta migração:
--   1. Família só tem Tarefas e Finanças: app.hub_pode/hub_pode_algum recusam qualquer outro módulo numa organização
--      'pessoal' (Contratos, envio de faturas, Ledgra Link, Societário, Licenças, Atendimento…), app.eh_gestor é falso
--      e o Fiscal (fis_pode, fis_pode_certificado) recusa o cliente da família.
--   2. Conta do cadastro aberto (app_metadata.origem = 'pessoal') nunca vira equipe nem Portal: os gatilhos de convite a
--      ignoram e um gatilho em membros/portal_usuarios recusa a entrada em organização 'empresa'. O cadastro também
--      recusa e-mail com convite pendente (pessoal_email_livre, só o servidor).
--   3. Travas da família: o limite de códigos errados passa a valer (BD-02); a organização da família não muda pela API
--      (fuso, criado_por, tipo… BD-03) e o limite de 3 famílias conta pela porta de entrada; membros não troca de conta
--      nem volta sozinho (BD-06/SEG-09); quem sai da família não fica preso por tarefa em aberto (BD-07); uma família com
--      problema não para o resumo das outras.
--   4. "Você tem empresa?" (BD-04/SEG-04): resposta sempre neutra, limite por conta (inclusive as retiradas), sem lead
--      repetido em 30 dias, e o CNPJ que já está no Funil vira tarefa de conferência (não parece consentimento).
--   5. Aviso no celular (SEG-08, BD-09): só endereços dos serviços de aviso conhecidos, aparelho não troca de dono, fila
--      com limpeza; a família já nasce com a conta "Dinheiro (carteira)" (UX-01).
-- O código é do Edvaldo Ribeiro de Carvalho (MDC Assessoria Contábil).

-- ================================================================================== 1 família só com Tarefas e Finanças
create or replace function app.hub_pode(p_org uuid, p_app text, p_min text default 'ver')
returns boolean language sql stable security definer set search_path = public as $$
  select case
    when app.papel(p_org) is null then false
    when p_app not in ('tarefas', 'financeiro') and app.org_pessoal(p_org) then false
    when app.papel(p_org) = 'admin' then true
    else exists (
      select 1 from public.hub_acessos a
       where a.org_id = p_org and a.user_id = auth.uid() and a.app = p_app
         and (a.expira_em is null or a.expira_em >= app.hoje(p_org))
         and app.hub_peso(a.papel) >= app.hub_peso(p_min))
  end
$$;

create or replace function app.hub_pode_algum(p_org uuid, p_apps text[], p_min text default 'ver')
returns boolean language sql stable security definer set search_path = public as $$
  select case
    when app.papel(p_org) is null then false
    when app.org_pessoal(p_org) and not (p_apps && array['tarefas', 'financeiro']) then false
    when app.papel(p_org) = 'admin' then true
    else exists (
      select 1 from public.hub_acessos a
       where a.org_id = p_org and a.user_id = auth.uid()
         and a.app = any (case when app.org_pessoal(p_org) then array(select unnest(p_apps) intersect select unnest(array['tarefas', 'financeiro'])) else p_apps end)
         and (a.expira_em is null or a.expira_em >= app.hoje(p_org))
         and app.hub_peso(a.papel) >= app.hub_peso(p_min))
  end
$$;

create or replace function app.eh_gestor(p_org uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(app.papel(p_org) in ('admin', 'gestor'), false) and not app.org_pessoal(p_org)
$$;

/** O cliente é a "empresa" de uma família do MDC · Pessoal? (Fiscal, certificado e agendadores não valem para ela.) */
create or replace function app.cliente_pessoal(p_cliente uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.clientes c join public.organizacoes o on o.id = c.org_id
                  where c.id = p_cliente and o.tipo = 'pessoal')
$$;
revoke all on function app.cliente_pessoal(uuid) from public, anon;
grant execute on function app.cliente_pessoal(uuid) to authenticated;

create or replace function public.fis_pode(p_cliente uuid, p_nivel text default 'ver')
returns boolean language sql stable security definer set search_path = public as $$
  select not app.cliente_pessoal(p_cliente)
     and case when p_nivel = 'ver' then app.fin_pode(p_cliente, 'ver')
              else app.gestao_pode(p_cliente, p_nivel, array['entradas', 'financeiro']) end
$$;

create or replace function public.fis_pode_certificado(p_cliente uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select app.empresa_gestao(p_cliente) and not app.cliente_pessoal(p_cliente)
     and exists (select 1 from clientes c where c.id = p_cliente and app.hub_pode(c.org_id, 'financeiro', 'gerir'))
$$;

/* Organização da família não muda pela API (nome só por pessoal_renomear; nada de fuso, criado_por, tipo, plano…). */
create or replace function app.tg_org_pessoal_fixa()
returns trigger language plpgsql set search_path = '' as $$
begin
  if old.tipo = 'pessoal' and current_user in ('authenticated', 'anon') then
    raise exception 'Os dados da família mudam só pela tela Família';
  end if;
  return new;
end $$;
revoke all on function app.tg_org_pessoal_fixa() from public, anon, authenticated;
drop trigger if exists org_pessoal_fixa on public.organizacoes;
create trigger org_pessoal_fixa before update on public.organizacoes for each row execute function app.tg_org_pessoal_fixa();

-- ============================================================ 2 conta do cadastro aberto não vira equipe nem Portal
create or replace function app.conta_pessoal(p_user uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select u.raw_app_meta_data ->> 'origem' = 'pessoal' from auth.users u where u.id = p_user), false)
$$;
revoke all on function app.conta_pessoal(uuid) from public, anon, authenticated;

create or replace function app.tg_conta_pessoal_fora_da_empresa()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if app.conta_pessoal(new.user_id) and not app.org_pessoal(new.org_id) then
    raise exception 'Este e-mail tem conta do MDC · Pessoal criada pelo cadastro aberto. Para a equipe ou o Portal, use outro e-mail (o corporativo) ou fale com a MDC';
  end if;
  return new;
end $$;
revoke all on function app.tg_conta_pessoal_fora_da_empresa() from public, anon, authenticated;
drop trigger if exists conta_pessoal_fora on public.membros;
create trigger conta_pessoal_fora before insert or update of user_id, org_id on public.membros
  for each row execute function app.tg_conta_pessoal_fora_da_empresa();
drop trigger if exists conta_pessoal_fora on public.portal_usuarios;
create trigger conta_pessoal_fora before insert or update of user_id, org_id on public.portal_usuarios
  for each row execute function app.tg_conta_pessoal_fora_da_empresa();

/* Os gatilhos de convite não aplicam convite a conta do cadastro aberto (e o convite continua pendente). */
create or replace function app.aplicar_convites()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.raw_app_meta_data ->> 'origem' = 'pessoal' then return new; end if;
  begin
    insert into public.membros (org_id, user_id, nome, email, papel, setor_id, perfil_id)
    select c.org_id, new.id,
           coalesce(nullif(trim(new.raw_user_meta_data ->> 'nome'), ''), c.nome, split_part(c.email, '@', 1)),
           c.email, c.papel, c.setor_id, c.perfil_id
      from app.convites c
     where c.email = lower(new.email)
    on conflict (org_id, user_id) do nothing;

    -- sem perfil: os módulos gravados no convite
    insert into public.hub_acessos (org_id, user_id, app, papel)
    select c.org_id, new.id, j.key, j.value
      from app.convites c, jsonb_each_text(c.apps) j
     where c.email = lower(new.email) and c.perfil_id is null
       and exists (select 1 from public.hub_apps a where a.slug = j.key)
    on conflict (org_id, user_id, app) do update set papel = excluded.papel;
    delete from public.hub_acessos a
     using app.convites c
     where c.email = lower(new.email) and c.perfil_id is null and c.apps <> '{}'::jsonb
       and a.org_id = c.org_id and a.user_id = new.id and not (c.apps ? a.app);

    delete from app.convites where email = lower(new.email);
  exception when others then
    raise warning 'aplicar_convites: %', sqlerrm;
  end;
  return new;
end $$;

create or replace function app.aplicar_convites_portal()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.raw_app_meta_data ->> 'origem' = 'pessoal' then return new; end if;
  begin
    insert into public.portal_usuarios (org_id, user_id, cliente_id, nome, email, permissoes)
    select c.org_id, new.id, c.cliente_id,
           coalesce(nullif(trim(new.raw_user_meta_data ->> 'nome'), ''), c.nome, split_part(c.email, '@', 1)),
           c.email, c.permissoes
      from public.portal_convites c where c.email = lower(new.email) and c.cancelado_em is null
    on conflict do nothing;
    perform set_config('app.pode_apagar', '1', true);
    delete from public.portal_convites where email = lower(new.email) and cancelado_em is null;
    perform set_config('app.pode_apagar', '', true);
  exception when others then
    raise warning 'aplicar_convites_portal: %', sqlerrm;
  end;
  return new;
end $$;

/** Só o servidor (cadastro aberto): o e-mail pode virar conta do Pessoal? Não, se tem convite pendente ou é ex-cliente. */
create or replace function public.pessoal_email_livre(p_email text)
returns boolean language sql stable security definer set search_path = '' as $$
  select not exists (select 1 from app.convites c where c.email = lower(trim(p_email)))
     and not exists (select 1 from public.portal_convites c where c.email = lower(trim(p_email)) and c.cancelado_em is null)
     and not exists (select 1 from app.ex_clientes x where x.email = lower(trim(p_email)))
$$;
revoke all on function public.pessoal_email_livre(text) from public, anon, authenticated;
grant execute on function public.pessoal_email_livre(text) to service_role;
comment on function public.pessoal_email_livre(text) is 'MDC · Pessoal: o cadastro aberto recusa e-mail com convite pendente da equipe/Portal ou de ex-cliente (078). Só o servidor.';

-- ========================================================================================== 3 travas da família
/* Membros de família: a conta e a organização não mudam pela API e quem saiu só volta por novo convite. */
create or replace function app.tg_membro_pessoal_fixo()
returns trigger language plpgsql set search_path = '' as $$
begin
  if app.org_pessoal(old.org_id) and current_user in ('authenticated', 'anon')
     and (new.user_id is distinct from old.user_id or new.org_id is distinct from old.org_id or (new.ativo and not old.ativo)) then
    raise exception 'Na família, quem saiu só volta por um novo convite';
  end if;
  return new;
end $$;
revoke all on function app.tg_membro_pessoal_fixo() from public, anon, authenticated;
drop trigger if exists membro_pessoal_fixo on public.membros;
create trigger membro_pessoal_fixo before update on public.membros for each row execute function app.tg_membro_pessoal_fixo();

/* Criar família: o limite de 3 conta pela porta de entrada (que a API não muda) e a família já nasce com a carteira. */
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

  insert into fin_plano_contas (org_id, cliente_id, codigo, classificacao, descricao, analitica, nivel)
  select v_org, v_cli, row_number() over (order by string_to_array(p.classificacao, '.')::int[])::text,
         p.classificacao, p.descricao, p.analitica, array_length(string_to_array(p.classificacao, '.'), 1)
    from app.pessoal_plano_padrao() p;
  insert into fin_categorias (org_id, cliente_id, tipo, grupo, nome, conta_contabil_id)
  select v_org, v_cli, case when c.classificacao like '1%' then 'receita' else 'despesa' end,
         case when c.classificacao like '1%' then 'Receitas' else m.descricao end, c.descricao, c.id
    from fin_plano_contas c
    left join fin_plano_contas m on m.cliente_id = c.cliente_id and m.classificacao = regexp_replace(c.classificacao, '\.[0-9]+$', '')
   where c.cliente_id = v_cli and c.analitica;
  -- onde o dinheiro fica: a família já pode pagar e receber em dinheiro; os bancos ela cadastra depois
  insert into fin_contas_bancarias (org_id, cliente_id, nome) values (v_org, v_cli, 'Dinheiro (carteira)');

  perform app.registrar(v_org, 'pessoal', 'familia_criar', v_org::text, null, jsonb_build_object('nome', v_nome));
  return v_slug;
end $$;

/*
 * Aceitar convite: código errado agora DEVOLVE null (sem raise) para a tentativa errada ficar gravada e o limite de 10
 * por hora valer (antes o raise desfazia o registro, BD-02). A tela mostra "Código de convite não encontrado".
 */
create or replace function public.pessoal_aceitar_convite(p_codigo text)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid(); c pessoal_convites; v_email text; v_pessoa text;
begin
  if v_user is null then raise exception 'Entre na sua conta para aceitar o convite'; end if;
  if (select count(*) from app.pessoal_tentativas where user_id = v_user and em > now() - interval '1 hour') >= 10 then
    raise exception 'Muitas tentativas com código errado. Espere uma hora ou peça um novo convite';
  end if;
  select * into c from pessoal_convites where codigo_hash = app.pessoal_hash(p_codigo) for update;
  if c.id is null then
    insert into app.pessoal_tentativas (user_id) values (v_user);
    return null;
  end if;
  if c.cancelado_em is not null then raise exception 'Este convite foi cancelado pelo responsável da família'; end if;
  if c.usado_em is not null then raise exception 'Este convite já foi usado. Peça um novo ao responsável da família'; end if;
  if c.expira_em < now() then raise exception 'Este convite venceu. Peça um novo ao responsável da família'; end if;
  if exists (select 1 from membros where org_id = c.org_id and user_id = v_user and ativo) then
    raise exception 'Você já faz parte desta família';
  end if;

  select lower(u.email), coalesce(nullif(trim(u.raw_user_meta_data ->> 'nome'), ''), c.nome)
    into v_email, v_pessoa from auth.users u where u.id = v_user;
  insert into app.pessoal_entradas (org_id, user_id, como, convite_id) values (c.org_id, v_user, 'convite', c.id)
  on conflict (org_id, user_id) do update set como = 'convite', convite_id = excluded.convite_id, em = now();
  insert into membros (org_id, user_id, nome, email, papel) values (c.org_id, v_user, v_pessoa, v_email, 'analista')
  on conflict (org_id, user_id) do update set ativo = true, papel = 'analista';
  perform app.pessoal_aplicar_permissao(c.org_id, v_user, c.permissao);
  update pessoal_convites set usado_por = v_user, usado_em = now() where id = c.id;
  perform app.registrar(c.org_id, 'pessoal', 'convite_aceito', v_email, null, jsonb_build_object('convite', c.id));
  return (select slug from organizacoes where id = c.org_id);
end $$;

/* Sair ou ser tirado da família: as tarefas em aberto da pessoa voltam para ninguém (não prende a saída, BD-07). */
create or replace function public.pessoal_remover(p_org uuid, p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not app.org_pessoal(p_org) then raise exception 'Família não encontrada'; end if;
  if p_user is distinct from auth.uid() and app.papel(p_org) is distinct from 'admin' then
    raise exception 'Só o responsável pela família tira pessoas';
  end if;
  update tarefas set responsavel_id = null
   where org_id = p_org and responsavel_id = p_user and status in ('a_fazer', 'em_andamento', 'aguardando');
  update membros set ativo = false where org_id = p_org and user_id = p_user and ativo;
  if not found then raise exception 'Pessoa não encontrada na família'; end if;
  delete from hub_acessos where org_id = p_org and user_id = p_user;
  perform app.registrar(p_org, 'pessoal', 'remover', p_user::text, null, null);
end $$;

/* Resumo diário: uma família com problema (fuso, dado estranho) não para o resumo das outras. */
create or replace function app.pessoal_resumo_rodar(p_agora timestamptz default now())
returns int language plpgsql security definer set search_path = '' as $$
declare
  r record;
  v_hoje date;
  v_hora int;
  v_res jsonb;
  n int := 0;
begin
  for r in
    select o.id as org_id, coalesce(o.fuso, 'America/Sao_Paulo') as fuso, m.user_id,
           coalesce(p.ligado, true) as ligado, coalesce(p.hora, 7) as hora, coalesce(p.celular, true) as celular, p.ultimo_dia
      from public.organizacoes o
      join public.membros m on m.org_id = o.id and m.ativo
      left join public.pessoal_resumo_preferencias p on p.org_id = o.id and p.user_id = m.user_id
     where o.tipo = 'pessoal' and o.ativo
       and (m.papel = 'admin' or exists (select 1 from public.hub_acessos a
                                          where a.org_id = o.id and a.user_id = m.user_id and a.app = 'financeiro'))
  loop
    begin
      v_hoje := (p_agora at time zone r.fuso)::date;
      v_hora := extract(hour from (p_agora at time zone r.fuso))::int;
      continue when not r.ligado or v_hora < r.hora or r.ultimo_dia is not distinct from v_hoje;

      v_res := app.pessoal_resumo_texto(r.org_id, v_hoje);
      insert into public.pessoal_resumo_preferencias (org_id, user_id, ultimo_dia)
      values (r.org_id, r.user_id, v_hoje)
      on conflict (org_id, user_id) do update set ultimo_dia = excluded.ultimo_dia;
      continue when not coalesce((v_res ->> 'tem')::boolean, false);

      insert into public.hub_notificacoes (org_id, user_id, app, titulo, texto, link)
      values (r.org_id, r.user_id, 'financeiro', v_res ->> 'titulo', v_res ->> 'texto', '/');
      if r.celular and exists (select 1 from public.pessoal_push_inscricoes i where i.user_id = r.user_id) then
        insert into app.pessoal_push_fila (user_id, titulo, texto, link) values (r.user_id, v_res ->> 'titulo', v_res ->> 'texto', '/');
      end if;
      n := n + 1;
    exception when others then
      raise warning 'pessoal_resumo_rodar: família % ficou sem resumo: %', r.org_id, sqlerrm;
    end;
  end loop;
  -- a fila guarda só o último dia
  delete from app.pessoal_push_fila where criado_em < p_agora - interval '2 days';
  return n;
end $$;

/* Datas no fuso da família (antes current_date em UTC, BD-11). */
create or replace function public.pessoal_empresa_adiar(p_org uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.membros where org_id = p_org and user_id = auth.uid() and ativo) then
    raise exception 'Família não encontrada';
  end if;
  insert into app.pessoal_cartao_empresa (org_id, user_id, adiado_ate) values (p_org, auth.uid(), app.hoje(p_org) + 90)
  on conflict (org_id, user_id) do update set adiado_ate = excluded.adiado_ate;
end $$;

create or replace function public.pessoal_empresa_situacao(p_org uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_resp boolean; v_ativas int; v_adiado date;
begin
  if not exists (select 1 from public.membros m join public.organizacoes o on o.id = m.org_id
                  where m.org_id = p_org and m.user_id = auth.uid() and m.ativo and o.tipo = 'pessoal') then
    raise exception 'Família não encontrada';
  end if;
  v_resp := exists (select 1 from public.membros where org_id = p_org and user_id = auth.uid() and ativo and papel::text = 'admin');
  select count(*) into v_ativas from public.pessoal_contatos_empresa where org_id = p_org and retirado_em is null;
  select adiado_ate into v_adiado from app.pessoal_cartao_empresa where org_id = p_org and user_id = auth.uid();
  return jsonb_build_object(
    'responsavel', v_resp,
    'mostrar_cartao', v_resp and v_ativas = 0 and (v_adiado is null or v_adiado <= app.hoje(p_org)),
    'pode_mais', v_resp and v_ativas < 3,
    'termo', (select jsonb_build_object('versao', t.versao, 'texto', t.texto) from app.pessoal_termo_contato() t),
    'empresas', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'cnpj', c.cnpj, 'razao_social', c.razao_social,
                                              'autorizado_em', c.autorizado_em) order by c.autorizado_em)
                            from public.pessoal_contatos_empresa c where c.org_id = p_org and c.retirado_em is null), '[]'::jsonb));
end $$;

-- ============================================================================ 4 "Você tem empresa?" sem revelar nada
revoke select (situacao) on public.pessoal_contatos_empresa from authenticated;

/**
 * "Quero contato": devolve sempre 'recebido' (não revela se o CNPJ é cliente ou já está no Funil). Limite: 5 pedidos por
 * conta em 30 dias, contando os retirados. CNPJ pedido de novo em 30 dias não cria lead nem avisa o Comercial outra vez.
 * CNPJ já no Funil vira TAREFA de conferência na oportunidade (não parece consentimento da empresa).
 */
create or replace function public.pessoal_quero_contato(p_org uuid, p jsonb)
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_cnpj text := regexp_replace(coalesce(p ->> 'cnpj', ''), '[^0-9]', '', 'g');
  v_razao text := left(nullif(trim(coalesce(p ->> 'razao_social', '')), ''), 200);
  v_tel text := nullif(regexp_replace(coalesce(p ->> 'telefone', ''), '[^0-9]', '', 'g'), '');
  v_rec jsonb := case when jsonb_typeof(p -> 'receita') = 'object' then p -> 'receita' else '{}'::jsonb end;
  v_email text; v_nome text; v_mdc uuid; v_op uuid; v_id uuid; v_sit text; v_dest uuid;
  v_termo record; v_cnpj_fmt text; v_empresa text; v_recente boolean;
begin
  if v_user is null then raise exception 'Entre na sua conta'; end if;
  if not exists (select 1 from public.membros m join public.organizacoes o on o.id = m.org_id
                  where m.org_id = p_org and m.user_id = v_user and m.ativo and m.papel::text = 'admin' and o.tipo = 'pessoal') then
    raise exception 'Só o responsável pela família pode pedir o contato da MDC';
  end if;
  select * into v_termo from app.pessoal_termo_contato();
  if coalesce(p ->> 'autorizo', '') <> 'true' then raise exception 'Para a MDC entrar em contato, marque a autorização'; end if;
  if coalesce(p ->> 'termo_versao', '') <> v_termo.versao::text then
    raise exception 'O texto da autorização mudou. Feche e abra o cartão de novo para ler a versão atual';
  end if;
  if not app.cnpj_valido(v_cnpj) then raise exception 'CNPJ inválido: confira os 14 números'; end if;
  if v_razao is null or length(v_razao) < 2 then raise exception 'Busque o CNPJ para trazer a razão social'; end if;
  if v_tel is not null and length(v_tel) not between 10 and 13 then raise exception 'Confira o telefone (com DDD)'; end if;
  perform pg_advisory_xact_lock(hashtext('pessoal_quero_contato:' || v_cnpj));
  if exists (select 1 from public.pessoal_contatos_empresa where org_id = p_org and cnpj = v_cnpj and retirado_em is null) then
    raise exception 'Esta empresa já está indicada';
  end if;
  if (select count(*) from public.pessoal_contatos_empresa where org_id = p_org and retirado_em is null) >= 3 then
    raise exception 'Cada família pode indicar até 3 empresas';
  end if;
  if (select count(*) from public.pessoal_contatos_empresa where user_id = v_user and autorizado_em > now() - interval '30 days') >= 5 then
    raise exception 'Você já fez muitos pedidos neste mês. Se precisar, fale com a MDC pelo WhatsApp (11) 98859-8041';
  end if;

  select lower(u.email), coalesce(nullif(trim(u.raw_user_meta_data ->> 'nome'), ''), split_part(u.email, '@', 1))
    into v_email, v_nome from auth.users u where u.id = v_user;
  v_email := coalesce(nullif(lower(trim(p ->> 'email')), ''), v_email);
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Confira o e-mail'; end if;

  v_mdc := app.org_mdc();
  v_cnpj_fmt := substr(v_cnpj, 1, 2) || '.' || substr(v_cnpj, 3, 3) || '.' || substr(v_cnpj, 6, 3) || '/' || substr(v_cnpj, 9, 4) || '-' || substr(v_cnpj, 13, 2);
  v_empresa := left(coalesce(nullif(trim(v_rec ->> 'nome_fantasia'), ''), v_razao), 160);
  v_id := gen_random_uuid();
  -- o mesmo CNPJ já pedido (por qualquer família) nos últimos 30 dias: grava a autorização, sem lead nem aviso novos
  v_recente := exists (select 1 from public.pessoal_contatos_empresa where cnpj = v_cnpj and autorizado_em > now() - interval '30 days');

  if exists (select 1 from public.clientes c where c.org_id = v_mdc and c.ativo
              and regexp_replace(coalesce(c.cnpj, ''), '[^0-9]', '', 'g') = v_cnpj) then
    v_sit := 'ja_cliente';
  else
    select o.id into v_op from public.crm_oportunidades o
     where o.org_id = v_mdc and o.arquivado_em is null and o.etapa not in ('ganho', 'perdido')
       and regexp_replace(coalesce(o.cnpj, ''), '[^0-9]', '', 'g') = v_cnpj
     order by o.criado_em desc limit 1;
    if v_op is not null then
      v_sit := 'lead_existente';
      if not v_recente then
        insert into public.crm_atividades (org_id, oportunidade_id, tipo, texto)
        values (v_mdc, v_op, 'tarefa', format('Conferir: alguém pediu contato pelo MDC · Pessoal informando este CNPJ (%s, e-mail %s%s). '
                                              || 'Confirme com a empresa antes de usar estes dados.', v_nome, v_email, coalesce(', telefone ' || v_tel, '')));
      end if;
    elsif v_recente then
      v_sit := 'lead_existente';
    else
      v_sit := 'lead_novo';
      insert into public.crm_oportunidades (org_id, empresa, razao_social, cnpj, contato_nome, email, whatsapp, cidade, uf,
                                            regime_atual, origem, origem_ref, dados_origem)
      values (v_mdc, v_empresa, v_razao, v_cnpj_fmt, left(v_nome, 120), left(v_email, 160), left(v_tel, 20),
              left(v_rec ->> 'municipio', 80), left(upper(v_rec ->> 'uf'), 2),
              case when v_rec ->> 'mei' = 'true' then 'mei' when v_rec ->> 'simples' = 'true' then 'simples' end,
              'pessoal', v_id::text,
              jsonb_strip_nulls(jsonb_build_object(
                'cnae', v_rec -> 'cnae', 'porte', v_rec -> 'porte', 'abertura', v_rec -> 'abertura',
                'situacao_cadastral', v_rec -> 'situacao', 'endereco', v_rec -> 'endereco',
                'telefone_receita', v_rec -> 'telefone', 'email_receita', v_rec -> 'email',
                'dados_da_tela', true,
                'autorizacao', jsonb_build_object('termo_versao', v_termo.versao, 'em', now()))))
      returning id into v_op;
      insert into public.crm_atividades (org_id, oportunidade_id, tipo, texto)
      values (v_mdc, v_op, 'nota', format('%s autorizou o contato da MDC pelo MDC · Pessoal (termo versão %s, %s). E-mail %s%s. '
                                           || 'Os dados da empresa vieram da tela: confira na Receita.',
                                           v_nome, v_termo.versao, to_char(now() at time zone 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI'),
                                           v_email, coalesce(', telefone ' || v_tel, '')));
      for v_dest in select m.user_id from public.membros m where m.org_id = v_mdc and m.ativo
                      and (m.papel::text = 'admin' or exists (select 1 from public.hub_acessos a
                                                               where a.org_id = v_mdc and a.user_id = m.user_id and a.app = 'comercial'))
      loop
        perform app.notificar(v_mdc, v_dest, 'comercial', 'Novo lead do MDC · Pessoal: ' || left(v_empresa, 80),
                              left(v_nome, 80) || coalesce(' · ' || (v_rec ->> 'municipio'), ''), '/comercial/' || v_op);
      end loop;
    end if;
  end if;

  insert into public.pessoal_contatos_empresa (id, org_id, user_id, cnpj, razao_social, nome, email, telefone, dados_receita,
                                               termo_versao, termo_texto, situacao, oportunidade_id)
  values (v_id, p_org, v_user, v_cnpj, v_razao, left(v_nome, 120), left(v_email, 160), v_tel, v_rec,
          v_termo.versao, v_termo.texto, v_sit, v_op);
  perform app.registrar(p_org, 'pessoal', 'contato_autorizar', v_cnpj, null, jsonb_build_object('termo', v_termo.versao));
  return 'recebido';
end $$;

/** A MDC (dona do Funil): pela empresa da Gestão com o CNPJ da MDC; se faltar, a primeira organização empresa ativa. */
create or replace function app.org_mdc()
returns uuid language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select o.id from public.organizacoes o join public.clientes c on c.id = o.gestao_cliente_id
      where o.tipo = 'empresa' and o.ativo and regexp_replace(coalesce(c.cnpj, ''), '[^0-9]', '', 'g') = '48140121000165' limit 1),
    (select id from public.organizacoes where tipo = 'empresa' and ativo order by criado_em limit 1)) $$;

-- ======================================================================================== 5 aviso no celular
/** Só serviços de aviso conhecidos; o aparelho de uma conta não passa para outra. */
create or replace function public.pessoal_push_inscrever(p_endpoint text, p_p256dh text, p_auth text, p_aparelho text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare v_dono uuid;
begin
  if auth.uid() is null then raise exception 'Entre na sua conta'; end if;
  if p_endpoint !~ '^https://(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|[a-z0-9.-]*\.push\.apple\.com|[a-z0-9.-]*\.notify\.windows\.com|[a-z0-9.-]*\.wns\.windows\.com)/' then
    raise exception 'Este navegador não é aceito para avisos. Use o Chrome, o Edge, o Firefox ou o Safari';
  end if;
  select user_id into v_dono from public.pessoal_push_inscricoes where endpoint = p_endpoint;
  if v_dono is not null and v_dono <> auth.uid() then
    raise exception 'Este aparelho já recebe avisos de outra conta. Desligue lá primeiro';
  end if;
  if v_dono is null and (select count(*) from public.pessoal_push_inscricoes where user_id = auth.uid()) >= 10 then
    raise exception 'Você já tem 10 aparelhos com aviso; desligue o aviso em um deles';
  end if;
  insert into public.pessoal_push_inscricoes (user_id, endpoint, p256dh, auth, aparelho)
  values (auth.uid(), p_endpoint, p_p256dh, p_auth, left(p_aparelho, 120))
  on conflict (endpoint) do update
    set p256dh = excluded.p256dh, auth = excluded.auth, aparelho = excluded.aparelho, falhas = 0;
end $$;

alter table app.pessoal_push_fila enable row level security;
revoke all on app.pessoal_push_fila from public, anon, authenticated;

do $$ begin
  if exists (select 1 from pg_namespace where nspname = 'cron') then
    if exists (select 1 from cron.job where jobname = 'pessoal-resumo') then perform cron.unschedule('pessoal-resumo'); end if;
    perform cron.schedule('pessoal-resumo', '3 * * * *', $cron$
      select app.pessoal_resumo_rodar();
      select net.http_post(
        url := 'https://bulqqdgfrrpqquqvjjfa.supabase.co/functions/v1/pessoal-aviso',
        headers := jsonb_build_object('Content-Type', 'application/json',
          'x-agente-token', (select decrypted_secret from vault.decrypted_secrets where name = 'pessoal_aviso_token')),
        body := '{"acao":"rodar"}'::jsonb,
        timeout_milliseconds := 60000)
      where exists (select 1 from app.pessoal_push_fila where enviado_em is null and tentativas < 3 and criado_em > now() - interval '1 day');
    $cron$);
  end if;
end $$;

-- ====================================================================================== 6 higiene de permissões
revoke all on function app.pessoal_brl(numeric), app.pessoal_termo_contato(), app.tg_org_ledgra(), app.tg_org_semear(),
  app.tg_org_semear_licencas() from public, anon, authenticated;

comment on function app.hub_pode(uuid, text, text) is 'Pode usar o app no nível pedido? Família (organização pessoal) só tem tarefas e financeiro (078).';
comment on function app.eh_gestor(uuid) is 'Administrador ou gestor de organização da equipe (nunca de família do MDC · Pessoal, 078).';
comment on function app.conta_pessoal(uuid) is 'Conta criada pelo cadastro aberto do MDC · Pessoal (app_metadata.origem = pessoal).';
comment on function app.tg_conta_pessoal_fora_da_empresa() is 'Conta do cadastro aberto não vira equipe nem Portal (078, SEG-01).';
