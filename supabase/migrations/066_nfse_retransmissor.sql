-- =====================================================================================================
--  066 · NFS-e: código interno do retransmissor (envio ao Emissor Nacional pelo site, em Node)
--
--  O servidor da Sefin Nacional (IIS) pede o certificado da empresa por renegociação TLS 1.2; o Deno das Funções Edge
--  (rustls) não renegocia e a conexão cai ("Connection reset by peer", 10/11/2026). A Função nfse-emitir continua
--  montando e assinando a DPS, e passa a entregar pelo retransmissor do site (web/src/app/api/nfse-relay, Node na
--  Vercel), que só fala com os endereços da Sefin. O retransmissor só atende quem traz este código interno:
--   1  segredo 'nfse_relay_token' no Vault, gerado pelo próprio banco (ninguém digita);
--   2  nfse_relay_token(): a Função lê o código (só service_role);
--   3  nfse_relay_confere(p_token): o site confere o código (anon/authenticated recebem só verdadeiro ou falso).
--  Testes: supabase/testes/135_relay_066.sql.
-- =====================================================================================================

do $$ begin
  if not exists (select 1 from vault.secrets where name = 'nfse_relay_token') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'nfse_relay_token',
      'Código interno gerado pelo banco: a Função nfse-emitir usa para chamar o retransmissor da NFS-e no site.');
  end if;
end $$;

create or replace function public.nfse_relay_token()
returns text language sql stable security definer set search_path = '' as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'nfse_relay_token'
$$;
revoke all on function public.nfse_relay_token() from public, anon, authenticated;
grant execute on function public.nfse_relay_token() to service_role;
comment on function public.nfse_relay_token() is 'Código do retransmissor da NFS-e para a Função nfse-emitir (só service_role) (066).';

create or replace function public.nfse_relay_confere(p_token text)
returns boolean language sql stable security definer set search_path = '' as $$
  select p_token is not null and length(p_token) = 64
     and exists (select 1 from vault.decrypted_secrets s where s.name = 'nfse_relay_token' and s.decrypted_secret = p_token)
$$;
revoke all on function public.nfse_relay_confere(text) from public;
grant execute on function public.nfse_relay_confere(text) to anon, authenticated, service_role;
comment on function public.nfse_relay_confere(text) is
  'O retransmissor da NFS-e (site) confere o código de quem chama; devolve só verdadeiro ou falso (066).';
