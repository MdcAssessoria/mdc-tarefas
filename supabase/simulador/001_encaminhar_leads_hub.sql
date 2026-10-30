-- Projeto mdc-simulador: cada lead novo é encaminhado ao CRM do HUB-MDC (projeto mdc-tarefas).
-- Usa a chave publicável do Hub (pública por natureza) e a função crm_receber_lead, que só aceita lead com consentimento.
create extension if not exists pg_net with schema extensions;
create schema if not exists privado;
create or replace function privado.encaminhar_lead_hub()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform net.http_post(
    url := 'https://bulqqdgfrrpqquqvjjfa.supabase.co/rest/v1/rpc/crm_receber_lead',
    headers := jsonb_build_object('Content-Type', 'application/json', 'apikey', 'sb_publishable_PZ8K_Udj-1cbUEAaTnkgYA_AmtuSLqU'),
    body := jsonb_build_object('p', to_jsonb(new) - 'consentimento_texto' - 'resultado' - 'parecer' - 'divergencias')
  );
  return new;
exception when others then
  return new;
end $$;
drop trigger if exists leads_encaminhar_hub on public.leads;
create trigger leads_encaminhar_hub after insert on public.leads for each row execute function privado.encaminhar_lead_hub();
