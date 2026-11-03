-- =====================================================================================================
--  047 · Correções de segurança da reauditoria de 03/11/2026 (docs/auditoria/2026-11-03-reauditoria.md, prioridade 1)
--
--   1  SEG-01  Anexos (hub_arquivos): nada se apaga. O registro não sai mais da tabela e o arquivo do Storage só é
--              apagado quando ficou órfão (envio que falhou antes de virar registro). "Retirar anexo" é só do
--              administrador, com motivo (5 letras ou mais), pela função hub_arquivo_retirar: o anexo some do Portal,
--              fica marcado como retirado e vai para a auditoria.
--   2  SEG-02  organizacoes.gestao_cliente_id (empresa da Gestão) só muda pela função org_definir_empresa_gestao
--   BD-07      (administrador, com motivo, auditada). Mudança direta pela API é recusada.
--   3  SEG-03  Contratos deixa de ler os cadastros inteiros do Financeiro (CPF/CNPJ, e-mail, telefone, agência e
--   BD-06      conta): as políticas contratos_ver de fin_pessoas, fin_categorias, fin_centros_custo e
--              fin_contas_bancarias saem; a tela usa fin_recorrente_opcoes (id, nome, tipo, ativo) e, para o PDF da
--              fatura, só os dados do cliente de quem já tem fatura (nome, documento, e-mail, cidade/UF).
--              A emissão da NFS-e (046) lê fin_pessoas como security definer e continua igual.
--   4  SEG-08  NaN e infinito recusados também nas tabelas do Portal e do Societário (portal_balancete_linhas,
--   BD-05      soc_taxas e demais colunas numéricas portal_* e soc_*), como a 042 fez na gestão.
--   5  SEG-09  Anexo enviado pelo Portal só se liga a tarefa ou conversa do próprio cliente.
--
--  Testes: supabase/testes/103_base_047.sql e 104_reauditoria_047.sql.
-- =====================================================================================================

-- ===================================================================================================== 1 anexos
alter table public.hub_arquivos
  add column if not exists retirado_em timestamptz,
  add column if not exists retirado_por uuid,
  add column if not exists retirado_motivo text;
comment on column public.hub_arquivos.retirado_em is
  'Anexo retirado pelo administrador (hub_arquivo_retirar, com motivo): some do Portal e das listas; o registro e o arquivo ficam (047).';

drop policy if exists hub_arquivos_equipe_delete on public.hub_arquivos;
revoke delete on public.hub_arquivos from authenticated, anon;
drop trigger if exists nada_se_apaga on public.hub_arquivos;
create trigger nada_se_apaga before delete on public.hub_arquivos
  for each row execute function app.tg_nada_se_apaga('retire o anexo (administrador, com motivo)');

/** Arquivo já enviado: caminho, módulo, organização, cliente e quem enviou não mudam; a retirada só pela função. */
create or replace function app.tg_arquivo_imutavel()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.caminho is distinct from old.caminho or new.org_id is distinct from old.org_id
     or new.cliente_id is distinct from old.cliente_id or new.enviado_por is distinct from old.enviado_por
     or new.app is distinct from old.app or new.ref_id is distinct from old.ref_id then
    raise exception 'Arquivo já enviado: caminho, módulo, organização, cliente e quem enviou não mudam (envie de novo)';
  end if;
  if (new.retirado_em is distinct from old.retirado_em or new.retirado_por is distinct from old.retirado_por
      or new.retirado_motivo is distinct from old.retirado_motivo)
     and current_user in ('authenticated', 'anon') then
    raise exception 'Para retirar um anexo use o botão Retirar (só o administrador, com motivo)';
  end if;
  if old.retirado_em is not null and new.visivel_cliente then
    raise exception 'Anexo retirado não volta ao Portal: envie o arquivo de novo';
  end if;
  return new;
end $$;
revoke all on function app.tg_arquivo_imutavel() from public, anon, authenticated;

/** Retira um anexo (administrador da organização, motivo com 5 letras ou mais). Nada se apaga: marca e audita. */
create or replace function public.hub_arquivo_retirar(p_arquivo uuid, p_motivo text)
returns void language plpgsql security definer set search_path = public as $$
declare a hub_arquivos; v_motivo text := trim(coalesce(p_motivo, ''));
begin
  select * into a from hub_arquivos where id = p_arquivo for update;
  if a.id is null then raise exception 'Anexo não encontrado'; end if;
  if app.papel(a.org_id) is distinct from 'admin' then raise exception 'Só o administrador retira anexos'; end if;
  if a.retirado_em is not null then raise exception 'Este anexo já foi retirado'; end if;
  if length(regexp_replace(v_motivo, '[^[:alpha:]]', '', 'g')) < 5 then
    raise exception 'Informe o motivo da retirada (pelo menos 5 letras)';
  end if;
  update hub_arquivos set retirado_em = now(), retirado_por = auth.uid(), retirado_motivo = v_motivo, visivel_cliente = false
   where id = a.id;
  perform app.registrar(a.org_id, 'arquivos', 'retirar_anexo', a.id::text,
    jsonb_build_object('nome', a.nome, 'app', a.app, 'caminho', a.caminho, 'cliente', a.cliente_id, 'visivel_cliente', a.visivel_cliente),
    jsonb_build_object('motivo', v_motivo));
end $$;
revoke all on function public.hub_arquivo_retirar(uuid, text) from public, anon;
grant execute on function public.hub_arquivo_retirar(uuid, text) to authenticated;
comment on function public.hub_arquivo_retirar(uuid, text) is
  'Retira um anexo (só administrador, motivo com 5 letras ou mais): some do Portal, fica marcado e auditado; nada se apaga (047).';

-- o cliente não vê anexo retirado
drop policy if exists hub_arquivos_cliente_select on public.hub_arquivos;
create policy hub_arquivos_cliente_select on public.hub_arquivos for select to authenticated
  using (visivel_cliente and retirado_em is null and cliente_id is not null and app.portal_pode(cliente_id, 'documentos'));

-- Storage: arquivo com registro não é apagado por ninguém pela API; só o envio que falhou (órfão) por quem enviou
drop policy if exists hub_storage_equipe_delete on storage.objects;
create policy hub_storage_equipe_delete on storage.objects for delete to authenticated
  using (bucket_id = 'hub-arquivos'
         and app.uuid_ou_nulo((storage.foldername(name))[1]) in (select app.minhas_orgs())
         and owner_id = (select auth.uid())::text
         and not exists (select 1 from public.hub_arquivos a where a.caminho = objects.name));

-- ===================================================================================================== 2 empresa da Gestão
/** Empresa da Gestão: mudança direta pela API é recusada; só a função org_definir_empresa_gestao (auditada). */
create or replace function app.tg_org_empresa_gestao()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.gestao_cliente_id is distinct from old.gestao_cliente_id and current_user in ('authenticated', 'anon') then
    raise exception 'A empresa da Gestão só muda em Configurações › Empresa da Gestão (administrador, com motivo)';
  end if;
  return new;
end $$;
revoke all on function app.tg_org_empresa_gestao() from public, anon, authenticated;
drop trigger if exists org_empresa_gestao on public.organizacoes;
create trigger org_empresa_gestao before update of gestao_cliente_id on public.organizacoes
  for each row execute function app.tg_org_empresa_gestao();

/** Define a empresa própria da organização para a Gestão (administrador; motivo obrigatório ao trocar uma já definida). */
create or replace function public.org_definir_empresa_gestao(p_org uuid, p_cliente uuid, p_motivo text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare o organizacoes; v_motivo text := trim(coalesce(p_motivo, ''));
begin
  select * into o from organizacoes where id = p_org for update;
  if o.id is null then raise exception 'Organização não encontrada'; end if;
  if app.papel(p_org) is distinct from 'admin' then raise exception 'Só o administrador define a empresa da Gestão'; end if;
  if p_cliente is null or not exists (select 1 from clientes where id = p_cliente and org_id = p_org) then
    raise exception 'Escolha uma empresa cadastrada nesta organização';
  end if;
  if o.gestao_cliente_id = p_cliente then return p_cliente; end if;
  if o.gestao_cliente_id is not null and length(regexp_replace(v_motivo, '[^[:alpha:]]', '', 'g')) < 5 then
    raise exception 'Trocar a empresa da Gestão muda todo o Financeiro: informe o motivo (pelo menos 5 letras)';
  end if;
  update organizacoes set gestao_cliente_id = p_cliente where id = p_org;
  perform app.registrar(p_org, 'organizacao', 'empresa_gestao', p_org::text,
    jsonb_build_object('gestao_cliente_id', o.gestao_cliente_id),
    jsonb_build_object('gestao_cliente_id', p_cliente, 'motivo', nullif(v_motivo, '')));
  return p_cliente;
end $$;
revoke all on function public.org_definir_empresa_gestao(uuid, uuid, text) from public, anon;
grant execute on function public.org_definir_empresa_gestao(uuid, uuid, text) to authenticated;
comment on function public.org_definir_empresa_gestao(uuid, uuid, text) is
  'Define a empresa da Gestão (organizacoes.gestao_cliente_id): só administrador; trocar uma já definida pede motivo; auditada (047).';

-- ===================================================================================================== 3 Contratos sem os cadastros inteiros
do $$
declare t text;
begin
  foreach t in array array['fin_pessoas', 'fin_categorias', 'fin_centros_custo', 'fin_contas_bancarias'] loop
    execute format('drop policy if exists contratos_ver on public.%I', t);
  end loop;
end $$;

/**
 * O que a tela de Contratos precisa dos cadastros (Contratos: ver): nomes para escolher e mostrar, sem documento,
 * e-mail, telefone, agência ou conta. "tomadores" = só os clientes que já têm fatura, com o que vai no PDF da fatura.
 */
create or replace function public.fin_recorrente_opcoes(p_cliente uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if p_cliente is null or not app.contratos_pode(p_cliente, 'ver') then
    raise exception 'Sem permissão para ver os contratos (módulo Contratos)';
  end if;
  return jsonb_build_object(
    'pessoas', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'nome', p.nome, 'tipo', p.tipo, 'ativo', p.ativo) order by p.nome, p.id)
                           from fin_pessoas p where p.cliente_id = p_cliente), '[]'),
    'categorias', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'nome', c.nome, 'tipo', c.tipo, 'grupo', c.grupo, 'ativo', c.ativo)
                                             order by c.tipo, c.nome, c.id)
                              from fin_categorias c where c.cliente_id = p_cliente), '[]'),
    'centros', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'nome', c.nome, 'ativo', c.ativo) order by c.nome, c.id)
                           from fin_centros_custo c where c.cliente_id = p_cliente), '[]'),
    'contas', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'nome', c.nome, 'ativo', c.ativo) order by c.nome, c.id)
                          from fin_contas_bancarias c where c.cliente_id = p_cliente), '[]'),
    'tomadores', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'nome', p.nome, 'documento', p.documento, 'email', p.email,
                                                               'cidade', p.cidade, 'uf', p.uf) order by p.nome, p.id)
                             from fin_pessoas p
                            where p.cliente_id = p_cliente
                              and exists (select 1 from fin_faturas f where f.pessoa_id = p.id and f.cliente_id = p_cliente)), '[]'));
end $$;
revoke all on function public.fin_recorrente_opcoes(uuid) from public, anon;
grant execute on function public.fin_recorrente_opcoes(uuid) to authenticated;
comment on function public.fin_recorrente_opcoes(uuid) is
  'Cadastros para a tela de Contratos (Contratos: ver): id, nome, tipo e ativo; dados do cliente só de quem tem fatura (PDF) (047).';

-- ===================================================================================================== 4 NaN no Portal e no Societário
do $$
declare r record; n text;
begin
  for r in
    select c.table_name, c.column_name from information_schema.columns c
     where c.table_schema = 'public' and c.data_type = 'numeric'
       and (c.table_name like 'portal\_%' or c.table_name like 'soc\_%')
       and exists (select 1 from information_schema.tables x where x.table_schema = 'public'
                    and x.table_name = c.table_name and x.table_type = 'BASE TABLE')
  loop
    n := left(r.table_name || '_' || r.column_name, 50) || '_numero_valido';
    if not exists (select 1 from pg_constraint where conname = n) then
      execute format('alter table public.%I add constraint %I check (%I is null or %I not in (''NaN''::numeric, ''Infinity''::numeric, ''-Infinity''::numeric))',
                     r.table_name, n, r.column_name, r.column_name);
    end if;
  end loop;
end $$;

-- ===================================================================================================== 5 anexo do Portal no lugar certo
/** Anexo do Portal ligado a tarefa ou conversa: só do próprio cliente do anexo. */
create or replace function app.tg_arquivo_portal_ref()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.app = 'portal' and new.ref_id is not null
     and not exists (select 1 from tarefas t where t.id = new.ref_id and t.cliente_id = new.cliente_id)
     and not exists (select 1 from portal_conversas c where c.id = new.ref_id and c.cliente_id = new.cliente_id) then
    raise exception 'Este envio não é de uma rotina ou conversa da sua empresa: abra a rotina certa e envie de novo';
  end if;
  return new;
end $$;
revoke all on function app.tg_arquivo_portal_ref() from public, anon, authenticated;
drop trigger if exists hub_arquivos_portal_ref on public.hub_arquivos;
create trigger hub_arquivos_portal_ref before insert on public.hub_arquivos
  for each row execute function app.tg_arquivo_portal_ref();
