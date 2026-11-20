-- Omie: restaura o agendamento do modelo bi_*.
-- Aplicada direto em produção em 19/11/2026 como "091_omie_restaura_agendamento" (versão 20261119205443) e trazida ao repositório
-- em 20/11/2026 (ALT-02). Daqui para baixo, o texto é idêntico ao gravado em produção.

-- 091 · Corrige a 090_omie_gestao, que colidiu com a 090_bi_gestao_omie/090c (BI de Gestão do Omie feito em outra
-- sessão no mesmo dia): devolve a função omie_token_confere e o agendamento "omie-sincronizar" exatamente como a 090c
-- deixou, e tira os dois agendamentos da 090_omie_gestao (a Função Edge dela não foi publicada).
create or replace function public.omie_token_confere(p_token text) returns boolean
 language sql stable security definer set search_path to 'public' as $$
  select exists (select 1 from vault.decrypted_secrets where name = 'omie_sync_token' and decrypted_secret = p_token)
$$;
revoke all on function public.omie_token_confere(text) from public, anon, authenticated;
grant execute on function public.omie_token_confere(text) to service_role;

select cron.unschedule('omie-agenda-diaria') where exists (select 1 from cron.job where jobname = 'omie-agenda-diaria');
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