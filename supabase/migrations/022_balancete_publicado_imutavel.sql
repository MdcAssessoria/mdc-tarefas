-- =====================================================================================================
--  022 · Números de balancete publicado não mudam (achado M-P3 da auditoria de 01/11/2026)
--
--  O PDF assinado (mês ou período) soma o resumo, os índices e as demonstrações gravados no balancete.
--  Até aqui só as contas ficavam travadas depois de publicar (migração 020); agora o cálculo também.
--  Para corrigir um número: despublicar, reprocessar e publicar de novo (fica tudo na auditoria).
--  O comentário do contador continua editável (é texto, não número).
-- =====================================================================================================

create or replace function app.tg_balancete_publicado_imutavel()
returns trigger language plpgsql set search_path = public as $$
begin
  if old.status = 'publicado' and new.status = 'publicado' and (
       new.resumo is distinct from old.resumo or new.indices is distinct from old.indices
    or new.alertas is distinct from old.alertas or new.conferencias is distinct from old.conferencias
    or new.demonstracoes is distinct from old.demonstracoes
    or new.periodo_inicio is distinct from old.periodo_inicio or new.periodo_fim is distinct from old.periodo_fim
    or new.competencia is distinct from old.competencia or new.cliente_id is distinct from old.cliente_id
    or new.org_id is distinct from old.org_id or new.arquivo_nome is distinct from old.arquivo_nome) then
    raise exception 'Balancete publicado: despublique antes de alterar os números';
  end if;
  return new;
end $$;
revoke all on function app.tg_balancete_publicado_imutavel() from public, anon, authenticated;

drop trigger if exists balancete_publicado_imutavel on public.portal_balancetes;
create trigger balancete_publicado_imutavel before update on public.portal_balancetes
  for each row execute function app.tg_balancete_publicado_imutavel();
