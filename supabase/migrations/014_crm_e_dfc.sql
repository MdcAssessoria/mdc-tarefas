-- =====================================================================
--  014 · CRM Comercial, mapa da DFC por conta e fim do selo "beta"
-- =====================================================================

-- módulos em uso deixam de aparecer como beta; Comercial vira o CRM
update public.hub_apps set status = 'ativo' where status = 'beta';
update public.hub_apps
   set nome = 'CRM Comercial',
       descricao = 'Leads do simulador e novos contatos → reunião → proposta → contrato → cliente',
       status = 'ativo'
 where slug = 'comercial';
update public.hub_perfis set apps = apps || '{"comercial":"operar"}'::jsonb where nome = 'Comercial';
update public.hub_perfis set apps = apps || '{"comercial":"gerir"}'::jsonb where nome = 'Gestor';

-- ---------------------------------------------------------------------
-- DFC: linha escolhida pelo contador para uma conta (prevalece sobre a regra automática)
-- ---------------------------------------------------------------------
create table if not exists public.portal_mapa_dfc (
  id            bigint generated always as identity primary key,
  org_id        uuid not null references public.organizacoes(id) on delete cascade,
  cliente_id    uuid references public.clientes(id) on delete cascade,   -- nulo = regra padrão da MDC
  classificacao text not null,
  linha         text not null check (linha in ('caixa','depreciacao','clientes','estoques','outros_ativos','fornecedores','obrigacoes',
                                               'outros_passivos','imobilizado','emprestimos_concedidos','emprestimos','socios','capital','lucros','resultado')),
  criado_por    uuid references auth.users(id) on delete set null,
  criado_em     timestamptz not null default now(),
  unique nulls not distinct (org_id, cliente_id, classificacao)
);
alter table public.portal_mapa_dfc enable row level security;
create policy mapa_dfc_select on public.portal_mapa_dfc for select to authenticated using (app.hub_pode(org_id, 'demonstrativos', 'ver'));
create policy mapa_dfc_write on public.portal_mapa_dfc for all to authenticated
  using (app.hub_pode(org_id, 'demonstrativos', 'operar')) with check (app.hub_pode(org_id, 'demonstrativos', 'operar'));

-- ---------------------------------------------------------------------
-- CRM
-- ---------------------------------------------------------------------
create table if not exists public.crm_oportunidades (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references public.organizacoes(id) on delete cascade,
  empresa          text not null,
  razao_social     text,
  cnpj             text,
  contato_nome     text,
  email            text,
  whatsapp         text,
  cidade           text,
  uf               text,
  atividade        text,
  regime_atual     text,
  faturamento      numeric,
  origem           text not null default 'outro' check (origem in ('simulador','indicacao','site','whatsapp','instagram','evento','outro')),
  origem_ref       text,
  dados_origem     jsonb,
  etapa            text not null default 'novo' check (etapa in ('novo','contato','reuniao','proposta','negociacao','ganho','perdido')),
  etapa_desde      timestamptz not null default now(),
  motivo_perda     text,
  responsavel_id   uuid references auth.users(id) on delete set null,
  valor_mensal     numeric,
  proximo_contato  date,
  observacoes      text,
  cliente_id       uuid references public.clientes(id) on delete set null,
  criado_por       uuid references auth.users(id) on delete set null,
  criado_em        timestamptz not null default now(),
  atualizado_em    timestamptz not null default now(),
  unique (org_id, origem, origem_ref)
);
create index if not exists crm_op_org on public.crm_oportunidades (org_id, etapa, atualizado_em desc);

create table if not exists public.crm_atividades (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references public.organizacoes(id) on delete cascade,
  oportunidade_id  uuid not null references public.crm_oportunidades(id) on delete cascade,
  tipo             text not null check (tipo in ('nota','ligacao','reuniao','email','whatsapp','tarefa','etapa','contrato')),
  texto            text not null,
  quando           timestamptz,
  concluida        boolean not null default false,
  autor_id         uuid references auth.users(id) on delete set null,
  criado_em        timestamptz not null default now()
);
create index if not exists crm_ativ_op on public.crm_atividades (oportunidade_id, criado_em desc);

create table if not exists public.crm_modelos (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references public.organizacoes(id) on delete cascade,
  nome           text not null,
  texto          text not null,
  ativo          boolean not null default true,
  versao         int not null default 1,
  atualizado_por uuid references auth.users(id) on delete set null,
  atualizado_em  timestamptz not null default now()
);

create table if not exists public.crm_contratos (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references public.organizacoes(id) on delete cascade,
  oportunidade_id  uuid not null references public.crm_oportunidades(id) on delete cascade,
  modelo_id        uuid references public.crm_modelos(id) on delete set null,
  modelo_versao    int,
  numero           text,
  valores          jsonb not null default '{}'::jsonb,
  texto            text not null,
  status           text not null default 'rascunho' check (status in ('rascunho','enviado','assinado','cancelado')),
  criado_por       uuid references auth.users(id) on delete set null,
  criado_em        timestamptz not null default now(),
  enviado_em       timestamptz,
  assinado_em      timestamptz
);
create index if not exists crm_contr_op on public.crm_contratos (oportunidade_id, criado_em desc);

alter table public.crm_oportunidades enable row level security;
alter table public.crm_atividades enable row level security;
alter table public.crm_modelos enable row level security;
alter table public.crm_contratos enable row level security;

create policy crm_op_select on public.crm_oportunidades for select to authenticated using (app.hub_pode(org_id, 'comercial', 'ver'));
create policy crm_op_write  on public.crm_oportunidades for all to authenticated
  using (app.hub_pode(org_id, 'comercial', 'operar')) with check (app.hub_pode(org_id, 'comercial', 'operar'));
create policy crm_at_select on public.crm_atividades for select to authenticated using (app.hub_pode(org_id, 'comercial', 'ver'));
create policy crm_at_write  on public.crm_atividades for all to authenticated
  using (app.hub_pode(org_id, 'comercial', 'operar')) with check (app.hub_pode(org_id, 'comercial', 'operar'));
create policy crm_mod_select on public.crm_modelos for select to authenticated using (app.hub_pode(org_id, 'comercial', 'ver'));
create policy crm_mod_write  on public.crm_modelos for all to authenticated
  using (app.hub_pode(org_id, 'comercial', 'gerir')) with check (app.hub_pode(org_id, 'comercial', 'gerir'));
create policy crm_ct_select on public.crm_contratos for select to authenticated using (app.hub_pode(org_id, 'comercial', 'ver'));
create policy crm_ct_write  on public.crm_contratos for all to authenticated
  using (app.hub_pode(org_id, 'comercial', 'operar')) with check (app.hub_pode(org_id, 'comercial', 'operar'));

-- histórico automático de mudança de etapa
create or replace function app.tg_crm_etapa()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.atualizado_em := now();
  if tg_op = 'UPDATE' and new.etapa is distinct from old.etapa then
    new.etapa_desde := now();
    insert into crm_atividades (org_id, oportunidade_id, tipo, texto, autor_id, concluida)
    values (new.org_id, new.id, 'etapa',
            'Etapa: ' || old.etapa || ' → ' || new.etapa || coalesce(' (' || new.motivo_perda || ')', ''),
            auth.uid(), true);
  end if;
  return new;
end $$;
drop trigger if exists crm_op_etapa on public.crm_oportunidades;
create trigger crm_op_etapa before update on public.crm_oportunidades for each row execute function app.tg_crm_etapa();

-- ganho: vira cliente da carteira (MDC Tarefas, Portal, Demonstrativos)
create or replace function public.crm_converter_cliente(p_op uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare o crm_oportunidades; v_cli uuid;
begin
  select * into o from crm_oportunidades where id = p_op;
  if o.id is null then raise exception 'Oportunidade não encontrada'; end if;
  if not app.hub_pode(o.org_id, 'comercial', 'operar') then raise exception 'Sem permissão'; end if;
  if o.cliente_id is not null then return o.cliente_id; end if;
  if o.cnpj is not null then
    select id into v_cli from clientes where org_id = o.org_id and regexp_replace(cnpj, '\D', '', 'g') = regexp_replace(o.cnpj, '\D', '', 'g') limit 1;
  end if;
  if v_cli is null then
    insert into clientes (org_id, razao_social, nome_fantasia, cnpj, regime, cidade, uf, ativo, cliente_desde)
    values (o.org_id, coalesce(o.razao_social, o.empresa), o.empresa, o.cnpj,
            case when o.regime_atual in ('simples','presumido','real','mei') then o.regime_atual else null end,
            o.cidade, case when upper(o.uf) ~ '^[A-Z]{2}$' then upper(o.uf) end, true, current_date)
    returning id into v_cli;
  end if;
  update crm_oportunidades set cliente_id = v_cli, etapa = 'ganho' where id = p_op;
  insert into crm_atividades (org_id, oportunidade_id, tipo, texto, autor_id, concluida)
  values (o.org_id, p_op, 'nota', 'Convertido em cliente da carteira', auth.uid(), true);
  return v_cli;
end $$;

-- entrada de leads do Simulador de Regime (site público, sem login)
create or replace function public.crm_receber_lead(p jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare v_org uuid; v_id uuid; v_dest uuid;
begin
  if coalesce((p->>'consentimento')::boolean, false) is not true then return; end if;
  if char_length(coalesce(p->>'nome','')) not between 2 and 120 or char_length(coalesce(p->>'empresa','')) not between 2 and 160 then return; end if;
  select id into v_org from organizacoes order by criado_em limit 1;
  insert into crm_oportunidades (org_id, empresa, razao_social, cnpj, contato_nome, email, whatsapp, cidade, uf, atividade,
                                 regime_atual, faturamento, origem, origem_ref, dados_origem)
  values (v_org, left(p->>'empresa', 160), left(p->>'razao_social', 200), left(p->>'cnpj', 18), left(p->>'nome', 120),
          left(p->>'email', 160), left(p->>'whatsapp', 20), left(p->>'cidade', 80), left(p->>'uf', 2), left(p->>'atividade', 20),
          left(p->>'regime_atual', 20), nullif(p->>'faturamento','')::numeric, 'simulador', coalesce(left(p->>'id', 60), gen_random_uuid()::text),
          jsonb_strip_nulls(jsonb_build_object(
            'melhor_regime', p->'melhor_regime', 'economia_estimada', p->'economia_estimada', 'carga_pct_melhor', p->'carga_pct_melhor',
            'folha', p->'folha', 'compras', p->'compras', 'margem', p->'margem', 'pct_b2b', p->'pct_b2b',
            'cnae', p->'cnae', 'cnae_descricao', p->'cnae_descricao', 'porte', p->'porte', 'situacao_cadastral', p->'situacao_cadastral',
            'origem', p->'origem', 'utm', p->'utm', 'criado_em_simulador', p->'created_at')))
  on conflict (org_id, origem, origem_ref) do nothing
  returning id into v_id;
  if v_id is null then return; end if;
  for v_dest in select m.user_id from membros m where m.org_id = v_org and m.ativo
                  and (m.papel = 'admin' or exists (select 1 from hub_acessos a where a.org_id = v_org and a.user_id = m.user_id and a.app = 'comercial'))
  loop
    perform app.notificar(v_org, v_dest, 'comercial', 'Novo lead: ' || left(p->>'empresa', 80),
                          coalesce(p->>'nome', '') || coalesce(' · ' || (p->>'cidade'), ''), '/comercial/' || v_id);
  end loop;
end $$;
revoke execute on function public.crm_receber_lead(jsonb) from public;
grant execute on function public.crm_receber_lead(jsonb) to anon, authenticated;
revoke execute on function public.crm_converter_cliente(uuid) from public, anon;
grant execute on function public.crm_converter_cliente(uuid) to authenticated;

-- modelo-base de contrato (o administrador substitui pelo texto da MDC na tela do CRM)
insert into public.crm_modelos (org_id, nome, texto)
select o.id, 'Prestação de serviços contábeis', $modelo$# CONTRATO DE PRESTAÇÃO DE SERVIÇOS CONTÁBEIS

Contrato nº {{numero}}

**CONTRATANTE:** {{razao_social}}, inscrita no CNPJ sob o nº {{cnpj}}, com sede em {{endereco}}, {{cidade_uf}}, neste ato representada por {{representante}}, {{representante_qualificacao}}.

**CONTRATADA:** MDC ASSESSORIA LTDA, inscrita no CNPJ sob o nº 48.140.121/0001-65, com sede em Bragança Paulista/SP, neste ato representada por seu responsável técnico, Edvaldo Ribeiro de Carvalho, contador, CRC 1SP346098-O/0.

As partes acima identificadas celebram o presente contrato de prestação de serviços contábeis, nos termos da Resolução CFC nº 1.590/2020 e dos arts. 593 a 609 e 1.177 a 1.178 do Código Civil, mediante as cláusulas seguintes.

## Cláusula 1ª — Do objeto

A CONTRATADA prestará à CONTRATANTE os seguintes serviços:

{{servicos}}

Serviços não relacionados acima serão objeto de orçamento à parte, aprovado previamente pela CONTRATANTE.

## Cláusula 2ª — Das obrigações da CONTRATANTE

A CONTRATANTE entregará à CONTRATADA, até o dia {{prazo_documentos}} do mês seguinte ao da competência, todos os documentos necessários à execução dos serviços (notas fiscais, extratos bancários, folha de ponto, contratos e demais comprovantes), responsabilizando-se pela veracidade, integridade e tempestividade das informações. Atrasos na entrega desobrigam a CONTRATADA de prazos que deles dependam, e eventuais multas decorrentes serão de responsabilidade da CONTRATANTE.

## Cláusula 3ª — Das obrigações da CONTRATADA

A CONTRATADA executará os serviços com zelo e diligência, observando as Normas Brasileiras de Contabilidade e o Código de Ética Profissional do Contador (NBC PG 01), mantendo sigilo sobre as informações recebidas e guardando os documentos pelo prazo em que estiverem sob sua posse.

## Cláusula 4ª — Dos honorários

Pelos serviços contratados, a CONTRATANTE pagará à CONTRATADA honorários mensais de **{{honorario_mensal}}** ({{honorario_extenso}}), com vencimento todo dia {{vencimento_dia}} de cada mês, a partir de {{inicio}}.

{{clausula_funcionarios}}

{{clausula_implantacao}}

{{clausula_13}}

Os honorários serão reajustados anualmente pela variação do {{reajuste_indice}} acumulada nos últimos 12 meses. O atraso no pagamento sujeitará a CONTRATANTE a multa de 2% e juros de 1% ao mês, e, após 30 dias, faculta à CONTRATADA suspender os serviços mediante comunicação prévia.

## Cláusula 5ª — Da vigência e da rescisão

Este contrato vigora por prazo {{vigencia}}, a partir de {{inicio}}, podendo ser rescindido por qualquer das partes mediante aviso prévio por escrito de {{aviso_previo}} dias, durante o qual os serviços e os honorários serão mantidos. Na rescisão, a CONTRATADA entregará os livros, documentos e arquivos da CONTRATANTE e prestará as informações necessárias à transição para o novo profissional, nos termos da Resolução CFC nº 1.590/2020.

## Cláusula 6ª — Da proteção de dados

As partes tratarão os dados pessoais envolvidos na prestação dos serviços exclusivamente para as finalidades deste contrato e para o cumprimento de obrigações legais, nos termos da Lei nº 13.709/2018 (LGPD).

## Cláusula 7ª — Do foro

Fica eleito o foro da Comarca de Bragança Paulista/SP para dirimir quaisquer questões oriundas deste contrato.

E, por estarem de acordo, as partes assinam o presente instrumento em duas vias de igual teor.

{{cidade_assinatura}}, {{data_assinatura}}.
$modelo$
  from public.organizacoes o where not exists (select 1 from public.crm_modelos m where m.org_id = o.id);

alter publication supabase_realtime add table public.crm_oportunidades;
