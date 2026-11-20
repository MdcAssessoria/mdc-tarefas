-- =====================================================================================================
-- 101 · Omie: remove o segundo modelo (NOV-02, decisão do Edvaldo em 20/11/2026: fica o modelo A, do BI de Gestão)
-- -----------------------------------------------------------------------------------------------------
-- O modelo B (090d_omie_gestao: omie_contas, omie_registros, omie_sincronizacoes, gestao_*; chaves no Vault) nunca
-- teve conexão nem Função Edge publicada e nada no site o chama. Ficam: omie_empresas/omie_notas/omie_movimentos/
-- bi_* (modelo A), a Função omie-sincronizar, o segredo omie_sync_token e a função omie_token_confere (restaurada
-- pela 090e). Sai também o segredo órfão omie_sinc_token do Vault (NOV-10).
-- Conferido antes (produção, 20/11/2026): omie_contas, omie_registros, omie_sincronizacoes, gestao_fatos e
-- gestao_complementares vazias; gestao_plano (95) e gestao_classificacao (503) só com a semente; nenhuma chave
-- omie_key_*/omie_secret_* no Vault; nenhuma chave estrangeira de fora apontando para essas tabelas.
-- =====================================================================================================

do $$
begin
  if exists (select 1 from public.omie_contas) or exists (select 1 from public.omie_registros)
     or exists (select 1 from public.gestao_fatos) or exists (select 1 from public.gestao_complementares) then
    raise exception 'O modelo B do Omie tem dados: confira antes de remover.';
  end if;
end $$;

drop function if exists public.gestao_classificar(uuid, text, text);
drop function if exists public.gestao_complementar_excluir(uuid, text);
drop function if exists public.gestao_complementar_salvar(jsonb);
drop function if exists public.gestao_complementares_importar(jsonb);
drop function if exists public.gestao_grupos();
drop function if exists public.gestao_lancamentos(uuid, text, date, date, text, text, uuid, text);
drop function if exists public.gestao_plano_do_grupo(uuid, text);
drop function if exists public.gestao_relatorio(uuid, text, date, date);
drop function if exists public.omie_conta_excluir(uuid, text);
drop function if exists public.omie_conta_salvar(jsonb);
drop function if exists public.omie_credenciais(uuid);
drop function if exists public.omie_registros_gravar(uuid, text, jsonb);
drop function if exists public.omie_sinc_progresso(uuid, jsonb, text, text);
drop function if exists public.omie_sinc_proxima();
drop function if exists public.omie_sincronizar_pedir(uuid, uuid, text);
drop function if exists app.omie_fatos_montar(uuid);
drop function if exists app.omie_agendar_diario();
drop function if exists app.gestao_complementar_gravar(jsonb, text, uuid);
drop function if exists app.gestao_grupo_pode(uuid, text, text);
drop function if exists app.gestao_chave(text);
drop function if exists app.omie_data(text);
drop function if exists app.omie_num(text);

drop table if exists public.gestao_fatos;
drop table if exists public.gestao_complementares;
drop table if exists public.gestao_classificacao;
drop table if exists public.gestao_plano;
drop table if exists public.omie_registros;
drop table if exists public.omie_sincronizacoes;
drop table if exists public.omie_contas;

select cron.unschedule('omie-agenda-diaria') where exists (select 1 from cron.job where jobname = 'omie-agenda-diaria');
delete from vault.secrets where name = 'omie_sinc_token' or name like 'omie\_key\_%' or name like 'omie\_secret\_%';
