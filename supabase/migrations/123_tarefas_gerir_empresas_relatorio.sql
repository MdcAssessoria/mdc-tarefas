-- 123 · Tarefas: quem tem o nível "Gerir" na ferramenta Tarefas (Pessoas e acessos) passa a configurar as empresas
-- (Configurações › Clientes: dados, responsáveis por setor, incluir, inativar/reativar) e a ver o relatório da equipe,
-- mesmo sendo analista (pedido do Edvaldo, 27/11/2026: "por permissão; são eles que definem de quem é a responsabilidade
-- de cada empresa"). Gestor e administrador continuam como antes. Importação do Domínio segue só com gestor.
-- Organização pessoal (família) fica de fora, como em app.eh_gestor.

create or replace function app.gere_tarefas(p_org uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(app.eh_gestor(p_org), false)
      or (not coalesce(app.org_pessoal(p_org), false) and coalesce(app.hub_pode(p_org, 'tarefas', 'gerir'), false))
$$;
comment on function app.gere_tarefas(uuid) is
  'Gestor/administrador ou quem tem Tarefas › Gerir: configura as empresas (Clientes) e vê o relatório da equipe (123).';
revoke all on function app.gere_tarefas(uuid) from public, anon;
grant execute on function app.gere_tarefas(uuid) to authenticated;

-- empresas (Configurações › Clientes) e responsáveis por setor
drop policy if exists clientes_insert on public.clientes;
create policy clientes_insert on public.clientes for insert to authenticated with check (app.gere_tarefas(org_id));
drop policy if exists clientes_update on public.clientes;
create policy clientes_update on public.clientes for update to authenticated
  using (app.gere_tarefas(org_id)) with check (app.gere_tarefas(org_id));
drop policy if exists cresp_write on public.cliente_responsaveis;
create policy cresp_write on public.cliente_responsaveis for all to authenticated
  using (app.gere_tarefas(org_id)) with check (app.gere_tarefas(org_id));

-- relatório da equipe: quem gere vê as tarefas de todos (a edição continua pela regra de antes)
drop policy if exists tarefas_select on public.tarefas;
create policy tarefas_select on public.tarefas for select to authenticated using (
  (org_id in (select app.minhas_orgs())) and app.hub_pode(org_id, 'tarefas', 'ver')
  and ((app.papel(org_id) = any (array['admin'::papel_membro, 'gestor'::papel_membro, 'tv'::papel_membro]))
       or app.gere_tarefas(org_id)
       or (responsavel_id = (select auth.uid())) or (criado_por = (select auth.uid()))
       or ((setor_id is not null) and (setor_id = app.meu_setor(org_id)))));

create or replace function public.inativar_cliente(p_cliente uuid, p_data date, p_motivo text default null)
returns jsonb language plpgsql security definer set search_path = 'public' as $function$
declare v_org uuid; n int;
begin
  select org_id into v_org from clientes where id = p_cliente;
  if v_org is null then raise exception 'Cliente não encontrado'; end if;
  if not app.gere_tarefas(v_org) then raise exception 'Só quem gere as Tarefas (ou gestor) pode inativar clientes'; end if;
  if p_data is null then raise exception 'Informe a data em que o cliente passou a ser inativo'; end if;
  update clientes set ativo = false, inativo_em = p_data, motivo_inativacao = nullif(trim(p_motivo), '')
   where id = p_cliente;
  n := app.aplicar_inativacao(p_cliente);
  return jsonb_build_object('tarefas_canceladas', n);
end $function$;

create or replace function public.reativar_cliente(p_cliente uuid)
returns jsonb language plpgsql security definer set search_path = 'public' as $function$
declare v_org uuid; n int;
begin
  select org_id into v_org from clientes where id = p_cliente;
  if v_org is null then raise exception 'Cliente não encontrado'; end if;
  if not app.gere_tarefas(v_org) then raise exception 'Só quem gere as Tarefas (ou gestor) pode reativar clientes'; end if;
  update clientes set ativo = true, inativo_em = null, motivo_inativacao = null where id = p_cliente;
  update tarefas set status = 'a_fazer', cancelada_por_inativacao = false
   where cliente_id = p_cliente and cancelada_por_inativacao and status = 'cancelada';
  get diagnostics n = row_count;
  return jsonb_build_object('tarefas_restauradas', n);
end $function$;
