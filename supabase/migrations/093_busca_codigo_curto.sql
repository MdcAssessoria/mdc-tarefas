-- =====================================================================================================
-- 093 · Busca de clientes por código do Domínio curto (1 ou 2 dígitos)
-- -----------------------------------------------------------------------------------------------------
-- Teste do Ledgra em produção (19/11/2026): na tela "Nova empresa › Empresas já cadastradas no HUB MDC" o exemplo
-- do campo sugere "41", mas a busca só começava com 3 caracteres, e os clientes com código de 1 ou 2 dígitos no
-- Domínio nunca eram achados.
--
-- O que muda em integracao_clientes_buscar (092):
--   · só números com 1 ou 2 dígitos → procura SÓ pelo código do Domínio, igual (não procura no CNPJ, que traria
--     quase todos os clientes);
--   · o resto continua como na 092 (texto com 3 ou mais caracteres; parte do CNPJ com 3 ou mais dígitos).
-- Mesma assinatura, mesmas permissões (só service_role, pela Função hub-integracao).
-- Testes: supabase/testes/165_busca_093.sql (base em 164_base_093.sql).
-- =====================================================================================================

create or replace function public.integracao_clientes_buscar(p_busca text)
returns table (id uuid, razao_social text, nome_fantasia text, cnpj text, regime text, cidade text, uf text,
               codigo_dominio text, cliente_desde date, segmento text)
language plpgsql stable security definer set search_path = public as $$
declare
  v_busca  text := btrim(regexp_replace(left(coalesce(p_busca, ''), 60), '\s+', ' ', 'g'));
  v_dig    text := regexp_replace(v_busca, '\D', '', 'g');
  v_codigo boolean := v_busca ~ '^[0-9]{1,2}$';
  v_cnpj   boolean := v_busca !~ '[[:alpha:]]' and length(v_dig) >= 3;
  v_padrao text := '%' || replace(replace(replace(v_busca, '\', '\\'), '%', '\%'), '_', '\_') || '%';
  v_org    uuid;
begin
  if length(v_busca) < 3 and not v_codigo then return; end if;
  select o.id into v_org from organizacoes o where o.slug = 'mdc';
  if v_org is null then return; end if;
  return query
    select c.id, c.razao_social, c.nome_fantasia, regexp_replace(c.cnpj, '\D', '', 'g'), c.regime::text, c.cidade,
           c.uf, c.codigo_dominio, coalesce(c.cliente_desde, c.inicio_em), c.segmento::text
      from clientes c
     where c.org_id = v_org and c.ativo
       and length(regexp_replace(coalesce(c.cnpj, ''), '\D', '', 'g')) = 14
       and case when v_codigo then c.codigo_dominio = v_busca
                when v_cnpj then regexp_replace(c.cnpj, '\D', '', 'g') like '%' || v_dig || '%' or c.codigo_dominio = v_busca
                else c.razao_social ilike v_padrao or c.nome_fantasia ilike v_padrao or c.codigo_dominio = v_busca end
     order by c.razao_social
     limit 15;
end $$;
revoke all on function public.integracao_clientes_buscar(text) from public, anon, authenticated;
grant execute on function public.integracao_clientes_buscar(text) to service_role;
comment on function public.integracao_clientes_buscar(text) is
  'Busca de clientes ativos da MDC para outro sistema, pela Função hub-integracao (só service_role). Código do '
  'Domínio de 1 ou 2 dígitos procura só pelo código (092, 093).';
