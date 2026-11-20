-- Omie: agendamento da sincronização.
-- Aplicada direto em produção em 19/11/2026 como "090c_omie_agendamento" (versão 20261119195807) e trazida ao repositório
-- em 20/11/2026 (ALT-02). Daqui para baixo, o texto é idêntico ao gravado em produção.

alter table public.omie_empresas add column if not exists carga_ate date;
comment on column public.omie_empresas.carga_ate is 'Até que dia a carga inicial já foi trazida (avança 1 mês por rodada) (090c).';

do $$
begin
  if not exists (select 1 from vault.secrets where name = 'omie_sync_token') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'omie_sync_token', 'Token da rotina omie-sincronizar (090c)');
  end if;
end $$;

select cron.unschedule('omie-sincronizar') where exists (select 1 from cron.job where jobname = 'omie-sincronizar');
select cron.schedule('omie-sincronizar', '*/5 * * * *', $job$
  select net.http_post(
    url := 'https://bulqqdgfrrpqquqvjjfa.supabase.co/functions/v1/omie-sincronizar',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'x-agente-token', (select decrypted_secret from vault.decrypted_secrets where name = 'omie_sync_token')),
    body := '{"acao":"rodar"}'::jsonb,
    timeout_milliseconds := 140000)
  where exists (select 1 from public.omie_empresas where ativo)
$job$);