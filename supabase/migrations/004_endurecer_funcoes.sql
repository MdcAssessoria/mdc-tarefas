-- 004 · Endurecer funções: sem execução anônima e search_path fixo
revoke execute on function public.adicionar_membro(uuid, text, text, public.papel_membro, uuid) from public, anon;
revoke execute on function public.criar_organizacao(text, text, text) from public, anon;
revoke execute on function public.gerar_competencia(uuid, date) from public, anon;
do $$ begin
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='rls_auto_enable') then
    execute 'revoke execute on function public.rls_auto_enable() from public, anon, authenticated';
  end if;
end $$;
alter function app.tg_tarefa_antes() set search_path = public;
revoke execute on all functions in schema app from anon;
