-- =====================================================================================================
--  053 · Contratos: envio automático das faturas por e-mail (Microsoft 365 / Graph) e WhatsApp (API oficial da Meta)
--
--  Pedido do Edvaldo (04/11/2026): a fila fin_envios (045/049) passa a sair de verdade pelos canais e-mail e WhatsApp.
--  Decisões: e-mail pelo Microsoft Graph (sendMail como hub@mdcassessoria.com, aplicativo no Azure com Mail.Send só nessa
--  caixa) e WhatsApp pela WhatsApp Business Platform (modelo aprovado "fatura_mdc" com o PDF da fatura).
--
--   1  fin_envios ganha: próxima tentativa, falhas seguidas, id da mensagem no provedor, reserva (em_envio_ate) e
--      reenvios. Espera crescente entre tentativas (10 min, 30 min, 2 h, 6 h, 24 h); depois de 6 falhas, ou de erro
--      definitivo (endereço inexistente, número sem WhatsApp), para e espera o "Reenviar".
--   2  fin_envio_canais: a Função Edge fatura-enviar diz se cada canal está configurado (segredos no painel). Enquanto
--      não estiver, os envios ficam 'aguardando_configuracao'; quando liga, passam sozinhos para 'pendente' (os que já
--      existem e os novos, por gatilho na fila). Se desligar, os que ainda não saíram voltam a aguardar.
--   3  Funções só do servidor (service_role): conferir o token do agendador (Vault), reservar a fila (só fatura pronta:
--      NFS-e emitida quando o envio leva a nota, boleto gerado quando leva o boleto; só a empresa da gestão), gravar o
--      resultado (enviado / erro com espera / definitivo; na 3ª falha avisa no sino quem gere Contratos) e o estado
--      dos canais. Teste de envio com o login de quem gere Contratos (até 5 por hora, auditado).
--   4  Telas: fin_envio_situacao (estado dos canais e contagem da fila, Contratos: ver) e fin_envio_reenviar (motivo,
--      Contratos: operar).
--   5  pg_cron a cada 10 min chama a fatura-enviar só quando há envio a fazer ou canal ainda não conferido na última hora.
--
--  Testes: supabase/testes/113_base_053.sql e 114_envio_053.sql.
-- =====================================================================================================

-- ===================================================================================================== 1 fila
alter table public.fin_envios
  add column if not exists proxima_tentativa_em timestamptz default now(),
  add column if not exists falhas integer not null default 0,
  add column if not exists mensagem_id text,
  add column if not exists em_envio_ate timestamptz,
  add column if not exists reenvios integer not null default 0;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'fin_envios_falhas_validas') then
    alter table public.fin_envios add constraint fin_envios_falhas_validas check (falhas >= 0 and reenvios >= 0);
  end if;
end $$;
create index if not exists fin_envios_fila on public.fin_envios (proxima_tentativa_em)
  where canal in ('email', 'whatsapp') and situacao in ('pendente', 'erro');
comment on column public.fin_envios.proxima_tentativa_em is
  'Quando a fatura-enviar pode tentar este envio (espera crescente depois de falha); nulo = parou (reenviar à mão) (053).';
comment on column public.fin_envios.falhas is 'Falhas seguidas desde o último sucesso ou reenvio (053).';
comment on column public.fin_envios.mensagem_id is 'Identificação da mensagem no provedor (Graph ou WhatsApp) (053).';

/** Espera depois da falha n (1 = 10 min … 5 ou mais = 24 h). */
create or replace function app.fin_envio_espera(p_falhas int)
returns interval language sql immutable set search_path = '' as $$
  select case greatest(p_falhas, 1) when 1 then interval '10 minutes' when 2 then interval '30 minutes'
                                    when 3 then interval '2 hours' when 4 then interval '6 hours' else interval '24 hours' end
$$;
revoke all on function app.fin_envio_espera(int) from public, anon, authenticated;

-- ===================================================================================================== 2 canais
create table if not exists public.fin_envio_canais (
  canal text primary key check (canal in ('email', 'whatsapp')),
  configurado boolean not null default false,
  detalhe text,
  remetente text,
  verificado_em timestamptz not null default now()
);
comment on table public.fin_envio_canais is
  'Estado dos canais de envio informado pela Função Edge fatura-enviar (segredos no painel do Supabase) (053). Só o servidor grava.';
alter table public.fin_envio_canais enable row level security;
revoke all on public.fin_envio_canais from public, anon, authenticated;

/** O canal está configurado (e-mail e WhatsApp; Portal não depende de configuração). */
create or replace function app.fin_envio_canal_ligado(p_canal text)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select configurado from fin_envio_canais where canal = p_canal), false)
$$;
revoke all on function app.fin_envio_canal_ligado(text) from public, anon, authenticated;

/** Envio novo de e-mail/WhatsApp nasce 'pendente' quando o canal já está configurado. */
create or replace function app.tg_fin_envio_canal()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.canal in ('email', 'whatsapp') and new.situacao = 'aguardando_configuracao' and app.fin_envio_canal_ligado(new.canal) then
    new.situacao := 'pendente';
    new.proxima_tentativa_em := now();
  end if;
  return new;
end $$;
revoke all on function app.tg_fin_envio_canal() from public, anon, authenticated;
drop trigger if exists fin_envio_canal on public.fin_envios;
create trigger fin_envio_canal before insert on public.fin_envios for each row execute function app.tg_fin_envio_canal();

-- ===================================================================================================== 3 servidor
-- token do agendador (gerado pelo banco, guardado no Vault; a Função confere) — mesmo jeito da fiscal-captura (032)
do $$ begin
  if not exists (select 1 from vault.secrets where name = 'fatura_enviar_token') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'fatura_enviar_token',
      'Token interno gerado pelo banco: o pg_cron usa para chamar a Função Edge fatura-enviar.');
  end if;
end $$;

/** Confere o token do agendador comparando os resumos SHA-256 (sem atalho pelo primeiro caractere diferente). */
create or replace function public.fin_envio_token_confere(p_token text)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(length(p_token) between 32 and 200, false)
     and exists (select 1 from vault.decrypted_secrets
                  where name = 'fatura_enviar_token'
                    and sha256(convert_to(decrypted_secret, 'UTF8')) = sha256(convert_to(p_token, 'UTF8')))
$$;

/** A Função informa se o canal está configurado; liga (aguardando → pendente) ou desliga (pendente → aguardando). */
create or replace function public.fin_envio_canal_estado(p_canal text, p_configurado boolean, p_detalhe text default null,
                                                         p_remetente text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_antes boolean; n int := 0;
begin
  if p_canal is null or p_canal not in ('email', 'whatsapp') then raise exception 'Canal de envio inválido'; end if;
  select configurado into v_antes from fin_envio_canais where canal = p_canal;
  insert into fin_envio_canais (canal, configurado, detalhe, remetente, verificado_em)
  values (p_canal, coalesce(p_configurado, false), left(p_detalhe, 300), left(p_remetente, 120), now())
  on conflict (canal) do update set configurado = excluded.configurado, detalhe = excluded.detalhe,
                                    remetente = excluded.remetente, verificado_em = now();
  if coalesce(p_configurado, false) then
    update fin_envios set situacao = 'pendente', proxima_tentativa_em = now(), atualizado_em = now()
     where canal = p_canal and situacao = 'aguardando_configuracao';
    get diagnostics n = row_count;
  else
    update fin_envios set situacao = 'aguardando_configuracao', atualizado_em = now()
     where canal = p_canal and situacao = 'pendente';
    get diagnostics n = row_count;
  end if;
  if v_antes is distinct from coalesce(p_configurado, false) then
    insert into hub_auditoria (org_id, user_id, app, acao, alvo, antes, depois)
    select o.id, null, 'contratos', 'envio_canal', p_canal, jsonb_build_object('configurado', v_antes),
           jsonb_build_object('configurado', coalesce(p_configurado, false), 'detalhe', left(p_detalhe, 300), 'envios_mudados', n)
      from organizacoes o where o.gestao_cliente_id is not null;
  end if;
  return jsonb_build_object('canal', p_canal, 'configurado', coalesce(p_configurado, false), 'envios_mudados', n);
end $$;

/** Envio pronto para sair: fatura não cancelada, NFS-e resolvida quando leva a nota, boleto gerado quando leva o boleto. */
create or replace function app.fin_envio_pronto(e fin_envios, f fin_faturas)
returns boolean language sql stable set search_path = public as $$
  select f.situacao <> 'cancelada'
     and f.nfse_situacao not in ('a_emitir', 'erro')
     and (not ('boleto' = any (e.conteudo)) or f.boleto_situacao = 'gerado')
$$;
revoke all on function app.fin_envio_pronto(fin_envios, fin_faturas) from public, anon, authenticated;

/** Reserva até p_limite envios de e-mail/WhatsApp prontos (5 min de reserva) e devolve tudo o que a mensagem precisa. */
create or replace function public.fin_envio_reservar(p_limite int default 20)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_ids bigint[];
begin
  select coalesce(array_agg(id), '{}') into v_ids from (
    select e.id from fin_envios e join fin_faturas f on f.id = e.fatura_id
     where e.canal in ('email', 'whatsapp') and e.situacao in ('pendente', 'erro')
       and e.proxima_tentativa_em is not null and e.proxima_tentativa_em <= now()
       and (e.em_envio_ate is null or e.em_envio_ate < now())
       and app.fin_envio_canal_ligado(e.canal)
       and app.empresa_gestao(e.cliente_id)
       and app.fin_envio_pronto(e, f)
     order by e.proxima_tentativa_em, e.id
     limit greatest(1, least(coalesce(p_limite, 20), 50))
     for update of e skip locked) x;
  update fin_envios set em_envio_ate = now() + interval '5 minutes' where id = any (v_ids);
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'envio', e.id, 'canal', e.canal, 'destino', e.destino, 'conteudo', to_jsonb(e.conteudo), 'etapa', e.etapa,
             'tentativa', e.tentativas + 1, 'org', e.org_id, 'cliente', e.cliente_id,
             'logo_url', o.logo_url,
             'fatura', jsonb_build_object('id', f.id, 'numero', f.numero, 'emissao', f.emissao, 'vencimento', f.vencimento,
                         'competencia', f.competencia, 'valor', f.valor, 'descricao', f.descricao, 'documento', f.documento,
                         'envio', f.envio, 'situacao', f.situacao, 'nfse_situacao', f.nfse_situacao, 'nfse_numero', f.nfse_numero,
                         'boleto_situacao', f.boleto_situacao, 'servico_codigo', f.servico_codigo, 'iss_aliquota', f.iss_aliquota,
                         'cancelamento_motivo', f.cancelamento_motivo),
             'contrato', k.descricao,
             'tomador', jsonb_build_object('nome', pe.nome, 'documento', pe.documento, 'email', pe.email, 'cidade', pe.cidade, 'uf', pe.uf),
             'nfse', (select jsonb_build_object('numero', n.numero_nfse, 'chave', n.chave_acesso, 'xml_caminho', n.xml_caminho)
                        from nfse_emissoes n
                       where n.fatura_id = f.id and n.ambiente = 'producao' and n.situacao = 'emitida' and n.xml_caminho is not null
                       limit 1),
             'boleto', (select jsonb_build_object('banco', b.banco, 'linha_digitavel', b.linha_digitavel, 'pix_copia_cola', b.pix_copia_cola,
                                                  'vencimento', b.vencimento, 'valor', b.valor)
                          from fin_fatura_boletos b
                         where b.fatura_id = f.id and b.situacao in ('registrada', 'vencida')
                         order by b.tentativa desc limit 1))
           order by e.id)
      from fin_envios e
      join fin_faturas f on f.id = e.fatura_id
      join fin_recorrentes k on k.id = f.recorrente_id
      join organizacoes o on o.id = e.org_id
      left join fin_pessoas pe on pe.id = f.pessoa_id
     where e.id = any (v_ids)), '[]');
end $$;

/**
 * Resultado de um envio. p: {ok, mensagem_id, erro, definitivo}. Sucesso = 'enviado'; falha = 'erro' com espera
 * crescente (6 falhas ou erro definitivo = para). Na 3ª falha seguida (ou no erro definitivo) avisa no sino.
 */
create or replace function public.fin_envio_resultado(p_envio bigint, p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare e fin_envios; f fin_faturas; v_ok boolean := coalesce((p->>'ok')::boolean, false); v_def boolean := coalesce((p->>'definitivo')::boolean, false);
  v_erro text := nullif(left(trim(coalesce(p->>'erro', '')), 500), ''); v_canal text; u record; v_sit text;
begin
  select * into e from fin_envios where id = p_envio for update;
  if e.id is null then raise exception 'Envio não encontrado'; end if;
  if e.canal not in ('email', 'whatsapp') then raise exception 'Só e-mail e WhatsApp saem pela fatura-enviar'; end if;
  if e.situacao not in ('pendente', 'erro') then
    update fin_envios set em_envio_ate = null where id = e.id;
    return jsonb_build_object('envio', e.id, 'situacao', e.situacao, 'ignorado', true);
  end if;
  select * into f from fin_faturas where id = e.fatura_id;
  v_canal := case e.canal when 'email' then 'e-mail' else 'WhatsApp' end;
  if v_ok then
    update fin_envios set situacao = 'enviado', enviado_em = now(), tentativas = tentativas + 1, falhas = 0, ultimo_erro = null,
                          mensagem_id = left(p->>'mensagem_id', 200), em_envio_ate = null, proxima_tentativa_em = null, atualizado_em = now()
     where id = e.id returning * into e;
    perform app.fin_recorrente_evento(f.recorrente_id, 'fatura',
      format('Fatura %s enviada por %s para %s%s', f.numero, v_canal, e.destino,
             case when e.etapa = 'boleto' then ' (boleto)' else '' end),
      jsonb_build_object('fatura', f.id, 'envio', e.id));
  else
    if v_erro is null then v_erro := 'O provedor recusou o envio sem dizer o motivo.'; end if;
    update fin_envios set situacao = 'erro', tentativas = tentativas + 1, falhas = falhas + 1, ultimo_erro = v_erro, em_envio_ate = null,
                          proxima_tentativa_em = case when v_def or falhas + 1 >= 6 then null else now() + app.fin_envio_espera(falhas + 1) end,
                          atualizado_em = now()
     where id = e.id returning * into e;
    if e.falhas = 3 or (v_def and e.falhas < 3) then
      for u in select * from app.contratos_quem_avisar(e.org_id) loop
        perform app.notificar(e.org_id, u.user_id, 'contratos', 'Contratos: fatura não foi enviada',
          format('A fatura %s não saiu por %s para %s: %s%s', f.numero, v_canal, e.destino, v_erro,
                 case when e.proxima_tentativa_em is null then ' Confira o endereço e clique em Reenviar.' else ' O HUB vai tentar de novo.' end),
          '/contratos/faturas');
      end loop;
    end if;
  end if;
  v_sit := app.fin_fatura_situacao(f.id);
  insert into hub_auditoria (org_id, user_id, app, acao, alvo, antes, depois)
  values (e.org_id, null, 'contratos', case when v_ok then 'envio_enviado' else 'envio_falhou' end, e.id::text, null,
          jsonb_build_object('fatura', f.numero, 'canal', e.canal, 'destino', e.destino, 'tentativa', e.tentativas, 'falhas', e.falhas,
                             'erro', v_erro, 'definitivo', v_def, 'mensagem_id', e.mensagem_id));
  return jsonb_build_object('envio', e.id, 'situacao', e.situacao, 'falhas', e.falhas, 'proxima', e.proxima_tentativa_em,
                            'fatura_situacao', v_sit);
end $$;

do $$
declare f text;
begin
  foreach f in array array['fin_envio_token_confere(text)', 'fin_envio_canal_estado(text, boolean, text, text)',
                           'fin_envio_reservar(integer)', 'fin_envio_resultado(bigint, jsonb)'] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    if exists (select 1 from pg_roles where rolname = 'service_role') then
      execute format('grant execute on function public.%s to service_role', f);
    end if;
  end loop;
end $$;

-- ===================================================================================================== 4 telas
/** Empresa da gestão da organização em que a pessoa gere/opera/vê Contratos (a única que envia faturas). */
create or replace function app.fin_envio_empresa(p_org uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select o.gestao_cliente_id from organizacoes o where o.id = p_org
$$;
revoke all on function app.fin_envio_empresa(uuid) from public, anon, authenticated;

/** Estado do envio para a tela (Contratos: ver): canais, contagem da fila e os últimos problemas. */
create or replace function public.fin_envio_situacao(p_org uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_cli uuid := app.fin_envio_empresa(p_org);
begin
  if v_cli is null or not app.contratos_pode(v_cli, 'ver') then raise exception 'Sem permissão para ver os envios (módulo Contratos)'; end if;
  return jsonb_build_object(
    'canais', coalesce((select jsonb_object_agg(c.canal, jsonb_build_object('configurado', c.configurado, 'detalhe', c.detalhe,
                                  'remetente', c.remetente, 'verificado_em', c.verificado_em)) from fin_envio_canais c), '{}'),
    'fila', coalesce((select jsonb_object_agg(x.chave, x.n) from (
               select e.canal || ':' || e.situacao as chave, count(*) as n from fin_envios e
                where e.cliente_id = v_cli and e.canal in ('email', 'whatsapp') group by 1) x), '{}'),
    'problemas', coalesce((select jsonb_agg(jsonb_build_object('envio', e.id, 'fatura', f.numero, 'canal', e.canal, 'destino', e.destino,
                                  'erro', e.ultimo_erro, 'falhas', e.falhas, 'proxima', e.proxima_tentativa_em) order by e.atualizado_em desc)
                             from (select * from fin_envios where cliente_id = v_cli and situacao = 'erro' order by atualizado_em desc limit 20) e
                             join fin_faturas f on f.id = e.fatura_id), '[]'));
end $$;

/** Reenviar um e-mail/WhatsApp (Contratos: operar, motivo com 5 letras): volta para a fila agora. */
create or replace function public.fin_envio_reenviar(p_envio bigint, p_motivo text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare e fin_envios; f fin_faturas; v_motivo text := trim(coalesce(p_motivo, '')); v_sit text;
begin
  select * into e from fin_envios where id = p_envio for update;
  if e.id is null then raise exception 'Envio não encontrado'; end if;
  if not app.contratos_pode(e.cliente_id, 'operar') then raise exception 'Sem permissão para reenviar faturas (módulo Contratos, nível operar)'; end if;
  if e.canal not in ('email', 'whatsapp') then raise exception 'Só e-mail e WhatsApp podem ser reenviados (o Portal mostra a fatura sozinho)'; end if;
  if e.situacao not in ('erro', 'enviado') then raise exception 'Este envio ainda está na fila: espere sair ou dar erro para reenviar'; end if;
  if length(regexp_replace(v_motivo, '[^[:alpha:]]', '', 'g')) < 5 then raise exception 'Informe o motivo do reenvio (pelo menos 5 letras)'; end if;
  select * into f from fin_faturas where id = e.fatura_id;
  if f.situacao = 'cancelada' then raise exception 'Fatura cancelada não é reenviada'; end if;
  update fin_envios set situacao = case when app.fin_envio_canal_ligado(e.canal) then 'pendente' else 'aguardando_configuracao' end,
                        proxima_tentativa_em = now(), falhas = 0, em_envio_ate = null, reenvios = reenvios + 1, atualizado_em = now()
   where id = e.id returning * into e;
  v_sit := app.fin_fatura_situacao(f.id);
  perform app.registrar(e.org_id, 'contratos', 'envio_reenviar', e.id::text, null,
    jsonb_build_object('fatura', f.numero, 'canal', e.canal, 'destino', e.destino, 'motivo', v_motivo));
  perform app.fin_recorrente_evento(f.recorrente_id, 'fatura',
    format('Reenvio da fatura %s por %s pedido: %s', f.numero, case e.canal when 'email' then 'e-mail' else 'WhatsApp' end, v_motivo),
    jsonb_build_object('fatura', f.id, 'envio', e.id));
  return jsonb_build_object('envio', e.id, 'situacao', e.situacao, 'fatura_situacao', v_sit);
end $$;

/** Teste de envio (Contratos: gerir na empresa da gestão; até 5 por hora; auditado). Quem envia é a Função Edge. */
create or replace function public.fin_envio_teste_registrar(p_org uuid, p_canal text, p_destino text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_cli uuid := app.fin_envio_empresa(p_org); v_dest text := lower(trim(coalesce(p_destino, ''))); n int;
begin
  if v_cli is null or not app.contratos_pode(v_cli, 'gerir') then
    raise exception 'Sem permissão para testar o envio (módulo Contratos, nível gerir)';
  end if;
  if p_canal is null or p_canal not in ('email', 'whatsapp') then raise exception 'Escolha e-mail ou WhatsApp'; end if;
  if p_canal = 'email' and v_dest !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Informe um e-mail válido para o teste'; end if;
  if p_canal = 'whatsapp' then
    v_dest := regexp_replace(v_dest, '\D', '', 'g');
    if length(v_dest) not between 10 and 13 then raise exception 'Informe o WhatsApp com DDD para o teste (ex.: 11 98888-7777)'; end if;
  end if;
  select count(*) into n from hub_auditoria where org_id = p_org and app = 'contratos' and acao = 'envio_teste' and em > now() - interval '1 hour';
  if n >= 5 then raise exception 'Já foram feitos 5 testes na última hora: espere um pouco e tente de novo'; end if;
  perform app.registrar(p_org, 'contratos', 'envio_teste', p_canal, null, jsonb_build_object('canal', p_canal, 'destino', v_dest));
  return jsonb_build_object('canal', p_canal, 'destino', v_dest, 'empresa', v_cli);
end $$;

do $$
declare f text;
begin
  foreach f in array array['fin_envio_situacao(uuid)', 'fin_envio_reenviar(bigint, text)', 'fin_envio_teste_registrar(uuid, text, text)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

-- ===================================================================================================== 5 agendamento
do $$ begin
  if exists (select 1 from pg_namespace where nspname = 'cron') then
    if exists (select 1 from cron.job where jobname = 'fatura-enviar') then perform cron.unschedule('fatura-enviar'); end if;
    perform cron.schedule('fatura-enviar', '*/10 * * * *', $cron$
      select net.http_post(
        url := 'https://bulqqdgfrrpqquqvjjfa.supabase.co/functions/v1/fatura-enviar',
        headers := jsonb_build_object('Content-Type', 'application/json',
          'x-agente-token', (select decrypted_secret from vault.decrypted_secrets where name = 'fatura_enviar_token')),
        body := '{"acao":"rodar"}'::jsonb,
        timeout_milliseconds := 140000)
      where exists (select 1 from public.fin_envios e
                     where e.canal in ('email', 'whatsapp')
                       and ((e.situacao in ('pendente', 'erro') and e.proxima_tentativa_em <= now())
                            or (e.situacao = 'aguardando_configuracao'
                                and not exists (select 1 from public.fin_envio_canais c
                                                 where c.canal = e.canal and c.verificado_em > now() - interval '1 hour'))))
    $cron$);
  end if;
end $$;
