-- Licença do Ledgra (067): gerar e revogar a chave são telas internas da MDC; o anon não precisa executar.
-- Só lic_ledgra_validar continua aberta ao anon (é o servidor do Ledgra que chama, com a chave publicável do HUB).
revoke execute on function public.lic_ledgra_chave_gerar(uuid), public.lic_ledgra_chave_revogar(uuid, text) from public, anon;
grant execute on function public.lic_ledgra_chave_gerar(uuid), public.lic_ledgra_chave_revogar(uuid, text) to authenticated;
