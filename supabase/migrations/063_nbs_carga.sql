-- =====================================================================================================
--  063 · Carga da tabela NBS: DELETE com WHERE
--
--  Na 1ª carga pela Função fiscal-tabelas (05/11/2026) o banco do Supabase recusou "DELETE requires a WHERE clause"
--  (extensão pg_safeupdate, que barra apagar a tabela inteira sem condição). fis_tabela_carregar (cópia da 062) passa a
--  apagar com "where true" — a troca continua de uma vez, na mesma transação.
-- =====================================================================================================

create or replace function public.fis_tabela_carregar(p_tabela text, p_versao text, p_publicada date, p_fonte text, p_linhas jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_atual text; v_n int; o record;
begin
  if p_tabela <> 'anexo_viii' then raise exception 'Tabela desconhecida: %', p_tabela; end if;
  if coalesce(p_versao, '') !~ '^\d+\.\d+\.\d+$' then raise exception 'Versão inválida: %', p_versao; end if;
  select versao into v_atual from fis_tabelas where tabela = p_tabela;
  if v_atual is not null and string_to_array(p_versao, '.')::int[] <= string_to_array(v_atual, '.')::int[] then
    raise exception 'A versão % não é mais nova que a carregada (%)', p_versao, v_atual;
  end if;
  v_n := jsonb_array_length(coalesce(p_linhas, '[]'));
  if v_n < 500 then raise exception 'A planilha nova veio com só % linhas: o formato pode ter mudado; nada foi trocado', v_n; end if;
  delete from fis_lc116_nbs where true; -- o Supabase recusa DELETE sem WHERE (pg_safeupdate)
  insert into fis_lc116_nbs (item, item_descricao, nbs, nbs_descricao, ativ_sn, ativ_sn_descricao, indop, versao)
  select distinct on (x->>'item', regexp_replace(x->>'nbs', '\D', '', 'g'))
         x->>'item', x->>'item_descricao', regexp_replace(x->>'nbs', '\D', '', 'g'), x->>'nbs_descricao', x->>'ativ_sn',
         x->>'ativ_sn_descricao', x->>'indop', p_versao
    from jsonb_array_elements(p_linhas) x
   where x->>'item' ~ '^\d{2}\.\d{2}(\.\d{2})?$' and regexp_replace(x->>'nbs', '\D', '', 'g') ~ '^\d{9}$';
  get diagnostics v_n = row_count;
  insert into fis_tabelas (tabela, versao, publicada_em, fonte, carregada_em, conferida_em, ultima_mensagem)
  values (p_tabela, p_versao, p_publicada, p_fonte, now(), now(), format('Versão %s carregada (%s pares serviço × NBS)', p_versao, v_n))
  on conflict (tabela) do update set versao = excluded.versao, publicada_em = excluded.publicada_em, fonte = excluded.fonte,
         carregada_em = now(), conferida_em = now(), ultima_mensagem = excluded.ultima_mensagem;
  for o in select id from organizacoes where gestao_cliente_id is not null loop
    perform app.avisar_admins(o.id, 'contratos', 'Tabela NBS atualizada',
      format('O governo publicou a versão %s do Anexo VIII da NFS-e (serviço × NBS). O HUB já atualizou: confira o NBS das regras fiscais.', p_versao),
      '/contratos/nota-fiscal');
  end loop;
  return jsonb_build_object('versao', p_versao, 'linhas', v_n);
end $$;
revoke all on function public.fis_tabela_carregar(text, text, date, text, jsonb) from public, anon, authenticated;
grant execute on function public.fis_tabela_carregar(text, text, date, text, jsonb) to service_role;
