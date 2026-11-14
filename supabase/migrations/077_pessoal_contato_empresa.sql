-- 077 MDC · Pessoal: "Você tem empresa?" — o responsável pela família informa o CNPJ e autoriza a MDC a entrar em
-- contato (pedido do Edvaldo em 14/11/2026). Vira lead no Funil do Comercial da MDC, com origem "MDC · Pessoal".
--
-- LGPD: o dado só sai da família com autorização específica e destacada (caixa desmarcada, texto exibido), e o banco
-- guarda o texto aceito, a versão e o instante (prova do consentimento). A autorização pode ser retirada a qualquer
-- momento: o lead é arquivado (nada se apaga no HUB) e o contato para. Vão para a MDC só: CNPJ, razão social, nome,
-- e-mail e telefone da pessoa, mais os dados públicos da empresa na Receita. Nada das finanças da família.
-- Regras:
--   - só o responsável (administrador) da família; no máximo 3 empresas autorizadas por família; CNPJ válido;
--   - CNPJ que já é cliente ativo da MDC não vira lead; CNPJ que já está no Funil ganha uma anotação na oportunidade;
--   - "Agora não" esconde o cartão por 90 dias.
-- O código é do Edvaldo Ribeiro de Carvalho (MDC Assessoria Contábil).

-- ============================================================================================ 1 origem nova no CRM
alter table public.crm_oportunidades drop constraint if exists crm_oportunidades_origem_check;
alter table public.crm_oportunidades add constraint crm_oportunidades_origem_check
  check (origem in ('simulador', 'indicacao', 'site', 'whatsapp', 'instagram', 'evento', 'outro', 'raiox', 'pessoal'));

-- ======================================================================================= 2 termo e autorizações
/** Texto da autorização em vigor. Mudou o texto? Suba a versão: quem autorizou antes fica com a versão antiga gravada. */
create or replace function app.pessoal_termo_contato()
returns table (versao int, texto text) language sql immutable set search_path = '' as $$
  select 1, 'Autorizo a MDC Assessoria Contábil a usar o CNPJ, a razão social, meu nome, e-mail e telefone, junto com os '
         || 'dados públicos da empresa na Receita Federal, só para me contatar sobre os serviços dela. Posso retirar a '
         || 'autorização quando quiser, aqui no app.' $$;
comment on function app.pessoal_termo_contato() is 'MDC · Pessoal: texto e versão da autorização de contato da MDC (077).';

create table if not exists public.pessoal_contatos_empresa (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizacoes(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  cnpj text not null check (cnpj ~ '^[0-9]{14}$'),
  razao_social text not null check (length(trim(razao_social)) between 2 and 200),
  nome text not null,
  email text not null,
  telefone text,
  dados_receita jsonb not null default '{}'::jsonb,
  termo_versao int not null,
  termo_texto text not null,
  autorizado_em timestamptz not null default now(),
  retirado_em timestamptz,
  situacao text not null check (situacao in ('lead_novo', 'lead_existente', 'ja_cliente')),
  oportunidade_id uuid references public.crm_oportunidades(id) on delete set null
);
create unique index if not exists pessoal_contatos_empresa_ativo on public.pessoal_contatos_empresa (org_id, cnpj) where retirado_em is null;
alter table public.pessoal_contatos_empresa enable row level security;
drop policy if exists pessoal_contatos_empresa_ler on public.pessoal_contatos_empresa;
create policy pessoal_contatos_empresa_ler on public.pessoal_contatos_empresa for select to authenticated
  using (user_id = (select auth.uid()));
revoke all on public.pessoal_contatos_empresa from anon, authenticated;
grant select (id, org_id, cnpj, razao_social, autorizado_em, retirado_em, situacao, termo_versao) on public.pessoal_contatos_empresa to authenticated;
comment on table public.pessoal_contatos_empresa is
  'MDC · Pessoal: autorizações de contato da MDC dadas pelo responsável da família (prova LGPD: texto, versão e instante). Grava só por pessoal_quero_contato/pessoal_retirar_contato.';

create table if not exists app.pessoal_cartao_empresa (
  org_id uuid not null references public.organizacoes(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  adiado_ate date not null,
  primary key (org_id, user_id)
);
alter table app.pessoal_cartao_empresa enable row level security;
revoke all on app.pessoal_cartao_empresa from public, anon, authenticated;
comment on table app.pessoal_cartao_empresa is 'MDC · Pessoal: "Agora não" do cartão Você tem empresa? (esconde até a data).';

/** CNPJ válido pelos dígitos verificadores (só números). */
create or replace function app.cnpj_valido(p text)
returns boolean language plpgsql immutable set search_path = '' as $$
declare d text := regexp_replace(coalesce(p, ''), '[^0-9]', '', 'g'); s int; i int; dv1 int; dv2 int;
  p1 int[] := array[5,4,3,2,9,8,7,6,5,4,3,2]; p2 int[] := array[6,5,4,3,2,9,8,7,6,5,4,3,2];
begin
  if length(d) <> 14 or d ~ '^(.)\1{13}$' then return false; end if;
  s := 0; for i in 1..12 loop s := s + substr(d, i, 1)::int * p1[i]; end loop;
  dv1 := case when s % 11 < 2 then 0 else 11 - s % 11 end;
  s := 0; for i in 1..13 loop s := s + substr(d, i, 1)::int * p2[i]; end loop;
  dv2 := case when s % 11 < 2 then 0 else 11 - s % 11 end;
  return dv1 = substr(d, 13, 1)::int and dv2 = substr(d, 14, 1)::int;
end $$;

/** A organização da MDC (dona do Funil): a primeira organização de tipo empresa, a mesma regra do crm_receber_lead. */
create or replace function app.org_mdc()
returns uuid language sql stable security definer set search_path = '' as $$
  select id from public.organizacoes where tipo = 'empresa' order by criado_em limit 1 $$;

revoke all on function app.cnpj_valido(text), app.org_mdc() from public, anon, authenticated;

-- ============================================================================================ 3 funções da tela
/** O que o cartão "Você tem empresa?" mostra para a pessoa logada nesta família. */
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
    'mostrar_cartao', v_resp and v_ativas = 0 and (v_adiado is null or v_adiado <= current_date),
    'pode_mais', v_resp and v_ativas < 3,
    'termo', (select jsonb_build_object('versao', t.versao, 'texto', t.texto) from app.pessoal_termo_contato() t),
    'empresas', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'cnpj', c.cnpj, 'razao_social', c.razao_social,
                                              'autorizado_em', c.autorizado_em) order by c.autorizado_em)
                            from public.pessoal_contatos_empresa c where c.org_id = p_org and c.retirado_em is null), '[]'::jsonb));
end $$;

/** "Agora não": esconde o cartão por 90 dias para esta pessoa nesta família. */
create or replace function public.pessoal_empresa_adiar(p_org uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.membros where org_id = p_org and user_id = auth.uid() and ativo) then
    raise exception 'Família não encontrada';
  end if;
  insert into app.pessoal_cartao_empresa (org_id, user_id, adiado_ate) values (p_org, auth.uid(), current_date + 90)
  on conflict (org_id, user_id) do update set adiado_ate = excluded.adiado_ate;
end $$;

/**
 * "Quero contato": grava a autorização (com o texto aceito) e leva a empresa ao Funil da MDC.
 * p = {cnpj, razao_social, telefone, email, autorizo: true, termo_versao, receita: {nome_fantasia, municipio, uf, cnae, porte,
 *      simples, mei, abertura, situacao, telefone, email, endereco}}. Devolve a situação: lead_novo, lead_existente, ja_cliente.
 */
create or replace function public.pessoal_quero_contato(p_org uuid, p jsonb)
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_cnpj text := regexp_replace(coalesce(p ->> 'cnpj', ''), '[^0-9]', '', 'g');
  v_razao text := nullif(trim(coalesce(p ->> 'razao_social', '')), '');
  v_tel text := nullif(regexp_replace(coalesce(p ->> 'telefone', ''), '[^0-9]', '', 'g'), '');
  v_rec jsonb := coalesce(p -> 'receita', '{}'::jsonb);
  v_email text; v_nome text; v_mdc uuid; v_op uuid; v_id uuid; v_sit text; v_dest uuid;
  v_termo record; v_cnpj_fmt text; v_empresa text;
begin
  if v_user is null then raise exception 'Entre na sua conta'; end if;
  if not exists (select 1 from public.membros m join public.organizacoes o on o.id = m.org_id
                  where m.org_id = p_org and m.user_id = v_user and m.ativo and m.papel::text = 'admin' and o.tipo = 'pessoal') then
    raise exception 'Só o responsável pela família pode pedir o contato da MDC';
  end if;
  select * into v_termo from app.pessoal_termo_contato();
  if coalesce((p ->> 'autorizo')::boolean, false) is not true then
    raise exception 'Para a MDC entrar em contato, marque a autorização';
  end if;
  if coalesce((p ->> 'termo_versao')::int, 0) <> v_termo.versao then
    raise exception 'O texto da autorização mudou. Feche e abra o cartão de novo para ler a versão atual';
  end if;
  if not app.cnpj_valido(v_cnpj) then raise exception 'CNPJ inválido: confira os 14 números'; end if;
  if v_razao is null or length(v_razao) < 2 then raise exception 'Busque o CNPJ para trazer a razão social'; end if;
  if v_tel is not null and length(v_tel) not between 10 and 13 then raise exception 'Confira o telefone (com DDD)'; end if;
  if exists (select 1 from public.pessoal_contatos_empresa where org_id = p_org and cnpj = v_cnpj and retirado_em is null) then
    raise exception 'Esta empresa já está autorizada';
  end if;
  if (select count(*) from public.pessoal_contatos_empresa where org_id = p_org and retirado_em is null) >= 3 then
    raise exception 'Cada família pode indicar até 3 empresas';
  end if;

  select lower(u.email), coalesce(nullif(trim(u.raw_user_meta_data ->> 'nome'), ''), split_part(u.email, '@', 1))
    into v_email, v_nome from auth.users u where u.id = v_user;
  v_email := coalesce(nullif(lower(trim(p ->> 'email')), ''), v_email);
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Confira o e-mail'; end if;

  v_mdc := app.org_mdc();
  v_cnpj_fmt := substr(v_cnpj, 1, 2) || '.' || substr(v_cnpj, 3, 3) || '.' || substr(v_cnpj, 6, 3) || '/' || substr(v_cnpj, 9, 4) || '-' || substr(v_cnpj, 13, 2);
  v_empresa := left(coalesce(nullif(trim(v_rec ->> 'nome_fantasia'), ''), v_razao), 160);
  v_id := gen_random_uuid();

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
    else
      v_sit := 'lead_novo';
      insert into public.crm_oportunidades (org_id, empresa, razao_social, cnpj, contato_nome, email, whatsapp, cidade, uf,
                                            regime_atual, origem, origem_ref, dados_origem)
      values (v_mdc, v_empresa, left(v_razao, 200), v_cnpj_fmt, left(v_nome, 120), left(v_email, 160), left(v_tel, 20),
              left(v_rec ->> 'municipio', 80), left(upper(v_rec ->> 'uf'), 2),
              case when (v_rec ->> 'mei')::boolean then 'mei' when (v_rec ->> 'simples')::boolean then 'simples' end,
              'pessoal', v_id::text,
              jsonb_strip_nulls(jsonb_build_object(
                'cnae', v_rec -> 'cnae', 'porte', v_rec -> 'porte', 'abertura', v_rec -> 'abertura',
                'situacao_cadastral', v_rec -> 'situacao', 'endereco', v_rec -> 'endereco',
                'telefone_receita', v_rec -> 'telefone', 'email_receita', v_rec -> 'email',
                'autorizacao', jsonb_build_object('termo_versao', v_termo.versao, 'em', now()))))
      returning id into v_op;
      for v_dest in select m.user_id from public.membros m where m.org_id = v_mdc and m.ativo
                      and (m.papel::text = 'admin' or exists (select 1 from public.hub_acessos a
                                                               where a.org_id = v_mdc and a.user_id = m.user_id and a.app = 'comercial'))
      loop
        perform app.notificar(v_mdc, v_dest, 'comercial', 'Novo lead do MDC · Pessoal: ' || left(v_empresa, 80),
                              left(v_nome, 80) || coalesce(' · ' || (v_rec ->> 'municipio'), ''), '/comercial/' || v_op);
      end loop;
    end if;
    insert into public.crm_atividades (org_id, oportunidade_id, tipo, texto)
    values (v_mdc, v_op, 'nota', format('%s autorizou o contato da MDC pelo MDC · Pessoal (termo versão %s, %s). E-mail %s%s.',
                                         v_nome, v_termo.versao, to_char(now() at time zone 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI'),
                                         v_email, coalesce(', telefone ' || v_tel, '')));
  end if;

  insert into public.pessoal_contatos_empresa (id, org_id, user_id, cnpj, razao_social, nome, email, telefone, dados_receita,
                                               termo_versao, termo_texto, situacao, oportunidade_id)
  values (v_id, p_org, v_user, v_cnpj, left(v_razao, 200), left(v_nome, 120), left(v_email, 160), v_tel, v_rec,
          v_termo.versao, v_termo.texto, v_sit, v_op);
  perform app.registrar(p_org, 'pessoal', 'contato_autorizar', v_cnpj, null, jsonb_build_object('situacao', v_sit, 'termo', v_termo.versao));
  return v_sit;
end $$;

/** "Não quero mais contato": retira a autorização; o lead que veio dela é arquivado (o histórico fica). */
create or replace function public.pessoal_retirar_contato(p_contato uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare c public.pessoal_contatos_empresa;
begin
  select * into c from public.pessoal_contatos_empresa where id = p_contato and user_id = auth.uid() for update;
  if c.id is null then raise exception 'Autorização não encontrada'; end if;
  if c.retirado_em is not null then return; end if;
  update public.pessoal_contatos_empresa set retirado_em = now() where id = c.id;
  if c.oportunidade_id is not null then
    insert into public.crm_atividades (org_id, oportunidade_id, tipo, texto)
    select o.org_id, o.id, 'nota', c.nome || ' retirou a autorização de contato dada pelo MDC · Pessoal. Não entre mais em contato por este canal.'
      from public.crm_oportunidades o where o.id = c.oportunidade_id;
    update public.crm_oportunidades
       set arquivado_em = now(), motivo_arquivo = 'A pessoa retirou a autorização de contato (MDC · Pessoal)'
     where id = c.oportunidade_id and origem = 'pessoal' and origem_ref = c.id::text
       and arquivado_em is null and etapa <> 'ganho';
  end if;
  perform app.registrar(c.org_id, 'pessoal', 'contato_retirar', c.cnpj, null, null);
end $$;

revoke all on function public.pessoal_empresa_situacao(uuid), public.pessoal_empresa_adiar(uuid),
  public.pessoal_quero_contato(uuid, jsonb), public.pessoal_retirar_contato(uuid) from public, anon;
grant execute on function public.pessoal_empresa_situacao(uuid), public.pessoal_empresa_adiar(uuid),
  public.pessoal_quero_contato(uuid, jsonb), public.pessoal_retirar_contato(uuid) to authenticated;
comment on function public.pessoal_empresa_situacao(uuid) is 'MDC · Pessoal: o que o cartão Você tem empresa? mostra (termo em vigor e empresas autorizadas).';
comment on function public.pessoal_empresa_adiar(uuid) is 'MDC · Pessoal: Agora não (esconde o cartão por 90 dias).';
comment on function public.pessoal_quero_contato(uuid, jsonb) is 'MDC · Pessoal: autorização de contato da MDC; leva a empresa ao Funil (origem pessoal).';
comment on function public.pessoal_retirar_contato(uuid) is 'MDC · Pessoal: retira a autorização de contato e arquiva o lead que veio dela.';
