-- Teste da 111 (A-01). Roda NA PRODUÇÃO dentro de begin…rollback; nada fica gravado.
-- Esperado: bi_indicadores do Grupo Clara no ano corrente bem abaixo dos 8 s do papel authenticated (antes: 13,3 s).
do $$
declare t0 timestamptz; ms numeric;
begin
  perform set_config('request.jwt.claims', '{"sub":"17391d29-62ee-4353-8818-8ee0edcdc0e9","role":"authenticated"}', true);
  t0 := clock_timestamp();
  perform public.bi_indicadores(array['128cce4c-cb86-414c-8096-c786c320cff0','2bfba338-901a-46ce-8b0d-fdc5163169da',
                                      '5db45b1b-bc87-44c1-bf5a-5a115f6dec30']::uuid[], '2026-01-01', '2026-11-21', true);
  ms := extract(epoch from clock_timestamp() - t0) * 1000;
  if ms > 2000 then raise exception 'bi_indicadores levou % ms (limite do teste: 2.000 ms).', round(ms); end if;
  raise notice 'bi_indicadores: % ms', round(ms);
end $$;
