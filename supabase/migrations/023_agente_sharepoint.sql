-- =====================================================================================================
--  023 · Agente da pasta de balancetes no SharePoint + histórico de importações
--
--  hub_integracoes   configuração por organização (endereço do site, biblioteca e pasta). Só administrador lê
--                    e grava pela tela (Configurações › Integrações); toda alteração vai para a auditoria.
--                    O segredo do aplicativo Microsoft NUNCA fica aqui: fica nos segredos da Função Edge.
--  hub_importacoes   o que chegou, quando, por qual porta (arquivo, lote, pasta) e o resultado.
--  portal_gravar_balancete passa a registrar a origem no histórico e aceita a chamada do servidor (agente).
--  pg_cron + pg_net  a cada 15 minutos chama a Função Edge balancete-agente, só se houver pasta ligada.
--                    O token interno dessa chamada é gerado pelo próprio banco e guardado no cofre (Vault).
-- =====================================================================================================

create extension if not exists pg_net;

-- ------------------------------------------------------------------------------------- configuração
create table if not exists public.hub_integracoes (
  org_id uuid not null references public.organizacoes(id) on delete cascade,
  tipo text not null check (tipo in ('sharepoint_balancetes')),
  config jsonb not null default '{}',
  ativo boolean not null default false,
  ultima_execucao timestamptz,
  ultimo_resultado text,
  atualizado_por uuid,
  atualizado_em timestamptz not null default now(),
  primary key (org_id, tipo)
);
alter table public.hub_integracoes enable row level security;
drop policy if exists hub_integracoes_admin on public.hub_integracoes;
create policy hub_integracoes_admin on public.hub_integracoes for all to authenticated
  using (app.papel(org_id) = 'admin') with check (app.papel(org_id) = 'admin');
comment on table public.hub_integracoes is
  'Integrações por organização (pasta do SharePoint dos balancetes). Só administrador; segredos ficam nos segredos da Função Edge.';

create or replace function app.tg_integracao_auditada()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.atualizado_em := now();
  -- execução do agente (sem usuário) só atualiza a situação; mudança de configuração precisa de administrador
  if auth.uid() is not null then
    new.atualizado_por := auth.uid();
    if tg_op = 'INSERT' or new.config is distinct from old.config or new.ativo is distinct from old.ativo then
      perform app.registrar(new.org_id, 'config', lower(tg_op), new.tipo,
        case when tg_op = 'UPDATE' then jsonb_build_object('config', old.config, 'ativo', old.ativo) end,
        jsonb_build_object('config', new.config, 'ativo', new.ativo));
    end if;
  end if;
  return new;
end $$;
revoke all on function app.tg_integracao_auditada() from public, anon, authenticated;
drop trigger if exists integracao_auditada on public.hub_integracoes;
create trigger integracao_auditada before insert or update on public.hub_integracoes
  for each row execute function app.tg_integracao_auditada();

-- ------------------------------------------------------------------------------------- histórico
create table if not exists public.hub_importacoes (
  id bigint generated always as identity primary key,
  org_id uuid not null references public.organizacoes(id) on delete cascade,
  origem text not null check (origem in ('arquivo', 'lote', 'pasta')),
  arquivo text not null,
  cliente_id uuid references public.clientes(id) on delete set null,
  competencia date,
  balancete_id uuid references public.portal_balancetes(id) on delete set null,
  resultado text not null check (resultado in ('importado', 'revisar', 'erro')),
  motivo text,
  em timestamptz not null default now(),
  por uuid
);
create index if not exists hub_importacoes_org_em on public.hub_importacoes (org_id, em desc);
alter table public.hub_importacoes enable row level security;
drop policy if exists hub_importacoes_ver on public.hub_importacoes;
create policy hub_importacoes_ver on public.hub_importacoes for select to authenticated
  using (app.hub_pode(org_id, 'demonstrativos', 'ver'));
-- gravação só pelas funções (portal_gravar_balancete e o agente no servidor)
comment on table public.hub_importacoes is
  'Histórico de importações de balancete: arquivo, porta de entrada (arquivo, lote, pasta do SharePoint), resultado e motivo.';

-- ------------------------------------------------------------------------------------- gravação com origem
drop function if exists public.portal_gravar_balancete(uuid, uuid, date, text, jsonb, jsonb);
create or replace function public.portal_gravar_balancete(
  p_org uuid, p_cliente uuid, p_competencia date, p_arquivo text, p_analise jsonb, p_linhas jsonb,
  p_origem text default 'arquivo')
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_status text;
  v_servidor boolean := coalesce(current_setting('request.jwt.claims', true)::jsonb ->> 'role', '') = 'service_role';
begin
  if not v_servidor and not app.hub_pode(p_org, 'demonstrativos', 'operar') then
    raise exception 'Sem permissão para importar balancetes';
  end if;
  if p_origem not in ('arquivo', 'lote', 'pasta') or (p_origem = 'pasta') <> v_servidor then raise exception 'Origem inválida'; end if;
  if not exists (select 1 from clientes c where c.id = p_cliente and c.org_id = p_org) then
    raise exception 'Cliente não encontrado nesta organização';
  end if;
  if p_competencia <> date_trunc('month', p_competencia)::date then raise exception 'Competência inválida'; end if;

  -- trava o mês do cliente enquanto grava (duas importações ao mesmo tempo não se misturam)
  perform pg_advisory_xact_lock(hashtext(p_cliente::text || p_competencia::text));
  select id, status into v_id, v_status from portal_balancetes where cliente_id = p_cliente and competencia = p_competencia for update;
  if v_status = 'publicado' then
    raise exception 'Este mês já está publicado para o cliente. Despublique na tela do balancete antes de importar de novo.';
  end if;

  if v_id is null then
    insert into portal_balancetes (org_id, cliente_id, competencia, status, arquivo_nome, importado_por, importado_em,
                                   resumo, indices, alertas, conferencias, demonstracoes, periodo_inicio, periodo_fim)
    values (p_org, p_cliente, p_competencia, 'rascunho', p_arquivo, auth.uid(), now(),
            coalesce(p_analise->'resumo', '{}'), coalesce(p_analise->'indices', '{}'), coalesce(p_analise->'alertas', '[]'),
            coalesce(p_analise->'conferencias', '[]'), p_analise->'demonstracoes',
            (p_analise->>'periodo_inicio')::date, (p_analise->>'periodo_fim')::date)
    returning id into v_id;
  else
    update portal_balancetes
       set arquivo_nome = p_arquivo, importado_por = auth.uid(), importado_em = now(),
           resumo = coalesce(p_analise->'resumo', '{}'), indices = coalesce(p_analise->'indices', '{}'),
           alertas = coalesce(p_analise->'alertas', '[]'), conferencias = coalesce(p_analise->'conferencias', '[]'),
           demonstracoes = p_analise->'demonstracoes',
           periodo_inicio = (p_analise->>'periodo_inicio')::date, periodo_fim = (p_analise->>'periodo_fim')::date
     where id = v_id;
    delete from portal_balancete_linhas where balancete_id = v_id;
  end if;
  perform app.inserir_contas_balancete(v_id, p_org, p_linhas);
  insert into hub_importacoes (org_id, origem, arquivo, cliente_id, competencia, balancete_id, resultado, por)
  values (p_org, p_origem, p_arquivo, p_cliente, p_competencia, v_id, 'importado', auth.uid());
  return v_id;
end $$;
revoke all on function public.portal_gravar_balancete(uuid, uuid, date, text, jsonb, jsonb, text) from public, anon;
grant execute on function public.portal_gravar_balancete(uuid, uuid, date, text, jsonb, jsonb, text) to authenticated, service_role;
comment on function public.portal_gravar_balancete(uuid, uuid, date, text, jsonb, jsonb, text) is
  'Importa o balancete do mês (cria ou substitui o rascunho) com cabeçalho, cálculo e contas numa transação só e registra no histórico. Mês publicado é recusado. Origem pasta = agente do servidor.';

-- ------------------------------------------------------------------------------------- token e agendamento
do $$ begin
  if not exists (select 1 from vault.secrets where name = 'agente_balancete_token') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'agente_balancete_token',
      'Token interno gerado pelo banco: o pg_cron usa para chamar a Função Edge balancete-agente.');
  end if;
end $$;

/** A Função Edge confere se a chamada veio do agendador (só o servidor pode perguntar). */
create or replace function public.agente_token_confere(p_token text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from vault.decrypted_secrets where name = 'agente_balancete_token' and decrypted_secret = p_token)
$$;
revoke all on function public.agente_token_confere(text) from public, anon, authenticated;
grant execute on function public.agente_token_confere(text) to service_role;

do $$ begin
  if exists (select 1 from cron.job where jobname = 'agente-balancetes') then perform cron.unschedule('agente-balancetes'); end if;
end $$;
select cron.schedule('agente-balancetes', '*/15 * * * *', $cron$
  select net.http_post(
    url := 'https://bulqqdgfrrpqquqvjjfa.supabase.co/functions/v1/balancete-agente',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'x-agente-token', (select decrypted_secret from vault.decrypted_secrets where name = 'agente_balancete_token')),
    body := '{"acao":"rodar"}'::jsonb,
    timeout_milliseconds := 120000)
  where exists (select 1 from public.hub_integracoes where tipo = 'sharepoint_balancetes' and ativo)
$cron$);
