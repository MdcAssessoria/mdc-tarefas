-- =====================================================================================================
-- 099 · Omie e BI de Gestão sem gravação direta pelo site (NOV-01, NOV-05 e NOV-06 da reauditoria de 19/11/2026)
-- -----------------------------------------------------------------------------------------------------
-- NOV-01 (alto): a política omie_emp_gerir deixava o administrador de QUALQUER organização (inclusive pessoal) gravar
-- em omie_empresas e escolher a credencial — a Função omie-sincronizar lê OMIE_<credencial>_KEY pelo nome gravado e
-- copiava para essa empresa as notas e os títulos de outra conta Omie. Agora ninguém logado grava nas tabelas
-- omie_* / bi_*: o cadastro da ligação com a Omie, dos grupos e do mapa de categorias é feito pela equipe técnica
-- (service_role) até existir tela própria com função security definer.
-- NOV-05: anon com leitura e escrita nas tabelas do BI; bi_linhas legível por qualquer logado de outra organização.
-- NOV-06: bi_complementar_importar escolhia a organização do lote pelo CNPJ da 1ª linha; agora exige uma só.
-- O modelo B do Omie (omie_contas, omie_registros, omie_sincronizacoes, gestao_*) fica como está até a decisão
-- NOV-02.
-- =====================================================================================================

do $$
declare t text;
begin
  foreach t in array array[
    'omie_empresas', 'omie_categorias', 'omie_execucoes', 'omie_movimentos', 'omie_nota_cfops', 'omie_notas',
    'bi_cfop_regras', 'bi_complementar_lotes', 'bi_complementares', 'bi_grupo_empresas', 'bi_grupos', 'bi_linhas',
    'bi_mapa_categorias', 'bi_orcamento', 'bi_acessos'] loop
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
  end loop;
end $$;

-- políticas de gravação que deixam de existir (sem permissão de escrita elas não fariam nada; ficam fora para não
-- voltarem a valer se alguém conceder escrita de novo)
drop policy if exists omie_emp_gerir on public.omie_empresas;
drop policy if exists bi_grupos_gerir on public.bi_grupos;
drop policy if exists bi_grupo_emp_gerir on public.bi_grupo_empresas;
drop policy if exists bi_linhas_gerir on public.bi_linhas;
drop policy if exists bi_mapa_gerir on public.bi_mapa_categorias;

-- linhas do relatório: as do padrão (org nula) para quem está logado; as próprias de uma organização só para ela
drop policy if exists bi_linhas_ver on public.bi_linhas;
create policy bi_linhas_ver on public.bi_linhas for select to authenticated
  using (org_id is null or app.hub_pode(org_id, 'bi_gestao', 'ver')
         or exists (select 1 from clientes c where c.org_id = bi_linhas.org_id and app.portal_pode(c.id, 'bi_gestao')));

-- NOV-06: todas as linhas da planilha de uma mesma organização; o lote fica nela
create or replace function public.bi_complementar_importar(p_arquivo text, p_linhas jsonb, p_origem text default 'excel')
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  v_org uuid; v_org_lote uuid; v_lote uuid; r jsonb; i int := 0; v_cli uuid; v_cnpj text; v_comp date; v_caixa date;
  v_dre text; v_dfc text; v_valor numeric; v_hist text; v_erros text[] := '{}'; v_ok int := 0;
begin
  if auth.uid() is null then raise exception 'Faça login de novo.'; end if;
  if jsonb_typeof(p_linhas) <> 'array' or jsonb_array_length(p_linhas) = 0 then raise exception 'A planilha está vazia.'; end if;
  if jsonb_array_length(p_linhas) > 5000 then raise exception 'Máximo de 5.000 linhas por carga.'; end if;
  if p_origem not in ('excel', 'manual', 'carga') then raise exception 'Origem inválida.'; end if;

  for r in select * from jsonb_array_elements(p_linhas) loop
    i := i + 1;
    begin
      v_cnpj := app.so_digitos(r->>'cnpj');
      v_cli := null;
      select c.id, c.org_id into v_cli, v_org from clientes c
       where app.so_digitos(c.cnpj) = v_cnpj and app.bi_pode_lancar(c.id)
       order by c.org_id = v_org_lote desc nulls last limit 1;
      if v_cli is null then raise exception 'empresa % não encontrada ou sem permissão', coalesce(r->>'cnpj', '(vazio)'); end if;
      if v_org_lote is null then v_org_lote := v_org;
      elsif v_org <> v_org_lote then raise exception 'empresas de organizações diferentes na mesma planilha'; end if;
      v_comp := date_trunc('month', (r->>'competencia')::date)::date;
      v_caixa := nullif(r->>'data_caixa', '')::date;
      v_dre := nullif(trim(r->>'linha_dre'), ''); v_dfc := nullif(trim(r->>'linha_dfc'), '');
      v_valor := round((r->>'valor')::numeric, 2);
      v_hist := nullif(trim(r->>'historico'), '');
      if v_dre is null and v_dfc is null then raise exception 'informe a linha da DRE e/ou da DFC'; end if;
      if v_dre is not null and not exists (select 1 from bi_linhas l where l.relatorio = 'dre' and l.codigo = v_dre and l.soma is null and l.ativo and (l.org_id is null or l.org_id = v_org)) then
        raise exception 'linha da DRE "%" não existe ou é subtotal', v_dre; end if;
      if v_dfc is not null and not exists (select 1 from bi_linhas l where l.relatorio = 'dfc' and l.codigo = v_dfc and l.soma is null and l.ativo and (l.org_id is null or l.org_id = v_org)) then
        raise exception 'linha da DFC "%" não existe ou é subtotal', v_dfc; end if;
      if v_dfc is not null and v_caixa is null then raise exception 'lançamento de DFC precisa da data do caixa'; end if;
      if v_valor is null or v_valor = 0 then raise exception 'valor vazio ou zero'; end if;
      if v_hist is null then raise exception 'histórico vazio'; end if;
    exception when others then
      v_erros := v_erros || format('Linha %s: %s', i + 1, sqlerrm);
    end;
  end loop;
  if cardinality(v_erros) > 0 then
    return jsonb_build_object('ok', false, 'erros', to_jsonb(v_erros[1:50]), 'total_erros', cardinality(v_erros));
  end if;

  insert into bi_complementar_lotes (org_id, arquivo_nome, origem, linhas)
  values (v_org_lote, left(p_arquivo, 200), p_origem, jsonb_array_length(p_linhas)) returning id into v_lote;
  for r in select * from jsonb_array_elements(p_linhas) loop
    select c.id into v_cli from clientes c
     where app.so_digitos(c.cnpj) = app.so_digitos(r->>'cnpj') and c.org_id = v_org_lote and app.bi_pode_lancar(c.id) limit 1;
    insert into bi_complementares (org_id, cliente_id, lote_id, competencia, data_caixa, linha_dre, linha_dfc, historico, valor)
    values (v_org_lote, v_cli, v_lote, date_trunc('month', (r->>'competencia')::date)::date, nullif(r->>'data_caixa', '')::date,
            nullif(trim(r->>'linha_dre'), ''), nullif(trim(r->>'linha_dfc'), ''), left(trim(r->>'historico'), 500),
            round((r->>'valor')::numeric, 2));
    v_ok := v_ok + 1;
  end loop;
  perform app.registrar(v_org_lote, 'bi_gestao', 'importar_complementares', v_lote::text, null,
                        jsonb_build_object('arquivo', p_arquivo, 'linhas', v_ok));
  return jsonb_build_object('ok', true, 'lote', v_lote, 'linhas', v_ok);
end $$;
revoke all on function public.bi_complementar_importar(text, jsonb, text) from public, anon;
grant execute on function public.bi_complementar_importar(text, jsonb, text) to authenticated, service_role;
