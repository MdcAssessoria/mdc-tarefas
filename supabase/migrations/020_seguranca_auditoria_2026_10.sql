-- =====================================================================================================
--  020 · Correções da auditoria de segurança de 31/10/2026 + descrição das tabelas no próprio banco
--
--  Relatório completo: docs/auditoria/2026-10-31-parecer.md (achados A-1, A-2, M-1 a M-4, B-5).
--
--  1) A-2  Acesso ao portal só por função auditada: a equipe não insere nem apaga portal_usuarios
--          direto, e ninguém da equipe pode ser "usuário de portal" da própria organização.
--  2) A-1  Link de convite devolvido na tela só para administrador (função hub_pode_ver_link_convite);
--          a Edge Function "convite" passa a usar essa regra.
--  3) M-1  Linhas de balancete publicado não mudam (o PDF assinado usa essas linhas).
--  4) M-2  soc_concluir_processo: só processo aberto; baixa (que inativa cliente) só para gestor.
--  5) M-3  Arquivos: a TV não lê nada; caminho, organização e cliente não mudam depois do envio;
--          apagar arquivo só gestor ou quem enviou.
--  6) M-4  Funções internas do esquema app deixam de ser executáveis por quem chama a API,
--          exceto as usadas pelas políticas RLS e views.
--  7) Objetos temporários *_temp: execução revogada (remoção definitiva fica para confirmação).
--  8) COMMENT ON em todas as tabelas: a descrição aparece no painel do Supabase.
-- =====================================================================================================

-- ------------------------------------------------------------------------------------- 1) A-2 portal
drop policy if exists portal_usuarios_write on public.portal_usuarios;
create policy portal_usuarios_update on public.portal_usuarios for update to authenticated
  using (app.eh_gestor(org_id) or app.hub_pode(org_id, 'atendimento', 'gerir'))
  with check (app.eh_gestor(org_id) or app.hub_pode(org_id, 'atendimento', 'gerir'));
-- sem insert/delete diretos: o vínculo nasce pelo convite (aplicar_convites_portal) e é desativado por update

create or replace function app.tg_portal_usuario_nao_equipe()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from membros m where m.org_id = new.org_id and m.user_id = new.user_id) then
    raise exception 'Pessoa da equipe não pode ser usuária do portal da própria organização';
  end if;
  if tg_op = 'INSERT' or new.ativo is distinct from old.ativo or new.permissoes is distinct from old.permissoes then
    perform app.registrar(new.org_id, 'portal', lower(tg_op), new.cliente_id::text,
      case when tg_op = 'UPDATE' then jsonb_build_object('ativo', old.ativo, 'permissoes', old.permissoes) end,
      jsonb_build_object('user_id', new.user_id, 'email', new.email, 'ativo', new.ativo, 'permissoes', new.permissoes));
  end if;
  return new;
end $$;
drop trigger if exists portal_usuario_nao_equipe on public.portal_usuarios;
create trigger portal_usuario_nao_equipe before insert or update on public.portal_usuarios
  for each row execute function app.tg_portal_usuario_nao_equipe();

-- ------------------------------------------------------------------------------------- 2) A-1 link
-- O link de convite (para repassar por WhatsApp quando o e-mail falha) só volta para administrador
-- da organização que convidou aquele e-mail para a EQUIPE. Convite de portal nunca devolve link.
create or replace function public.hub_pode_ver_link_convite(p_email text)
returns boolean language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and (
    exists (select 1 from app.convites c where c.email = lower(trim(p_email)) and app.papel(c.org_id) = 'admin')
    or exists (select 1 from membros m join auth.users u on u.id = m.user_id
                where lower(u.email) = lower(trim(p_email)) and app.papel(m.org_id) = 'admin'
                  and u.email_confirmed_at is null and u.last_sign_in_at is null)
  )
$$;
revoke all on function public.hub_pode_ver_link_convite(text) from public, anon;
grant execute on function public.hub_pode_ver_link_convite(text) to authenticated;
comment on function public.hub_pode_ver_link_convite(text) is
  'A Edge Function convite só devolve o link de convite (fallback do e-mail) se esta função for verdadeira: administrador da organização que convidou o e-mail para a equipe.';

-- ------------------------------------------------------------------------------------- 3) M-1 linhas publicadas
create or replace function app.tg_linhas_balancete_protegidas()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_status text;
begin
  if coalesce(current_setting('app.publicando', true), '') = '1' or auth.uid() is null then
    return coalesce(new, old);
  end if;
  select b.status into v_status from portal_balancetes b where b.id = coalesce(new.balancete_id, old.balancete_id);
  if v_status = 'publicado' then
    raise exception 'Balancete publicado: despublique antes de alterar as linhas';
  end if;
  return coalesce(new, old);
end $$;
drop trigger if exists linhas_balancete_protegidas on public.portal_balancete_linhas;
create trigger linhas_balancete_protegidas before insert or update or delete on public.portal_balancete_linhas
  for each row execute function app.tg_linhas_balancete_protegidas();

-- ------------------------------------------------------------------------------------- 4) M-2 concluir processo
create or replace function public.soc_concluir_processo(p_proc uuid)
returns void language plpgsql security definer set search_path = public as $$
declare p soc_processos; t soc_tipos; v_cli uuid; v_hoje date;
begin
  select * into p from soc_processos where id = p_proc;
  if p.id is null then raise exception 'Processo não encontrado'; end if;
  if not app.hub_pode(p.org_id, 'societario', 'operar') then raise exception 'Sem permissão'; end if;
  if p.status <> 'aberto' then raise exception 'Só processo em andamento pode ser concluído'; end if;
  select * into t from soc_tipos where id = p.tipo_id;
  if t.codigo = 'baixa' and p.cliente_id is not null and not app.eh_gestor(p.org_id) then
    raise exception 'Concluir uma baixa inativa o cliente: só gestor ou administrador';
  end if;
  v_hoje := app.hoje(p.org_id);
  update soc_processos set status = 'concluido', concluido_em = v_hoje, atualizado_em = now() where id = p_proc;
  update tarefas set status = 'cancelada'
   where id in (select tarefa_id from soc_fases where processo_id = p_proc and status not in ('concluida', 'dispensada'))
     and status not in ('concluida', 'cancelada');
  update soc_fases set status = 'dispensada', mudou_em = now()
   where processo_id = p_proc and status not in ('concluida', 'dispensada');

  if t.codigo = 'abertura' and p.cliente_id is null then
    insert into clientes (org_id, razao_social, cnpj, uf, ativo, cliente_desde)
    values (p.org_id, p.futuro_cliente, p.cnpj, p.uf, true, date_trunc('month', v_hoje)::date)
    returning id into v_cli;
    update soc_processos set cliente_id = v_cli where id = p_proc;
    perform app.soc_evento(p_proc, 'status', 'Cliente cadastrado no Hub: ' || p.futuro_cliente, false);
  elsif t.codigo = 'baixa' and p.cliente_id is not null then
    update clientes set ativo = false, inativo_em = v_hoje,
           motivo_inativacao = coalesce(motivo_inativacao, 'Baixa/encerramento (Societário #' || p.numero || ')')
     where id = p.cliente_id and ativo;
    perform app.aplicar_inativacao(p.cliente_id);
    perform app.soc_evento(p_proc, 'status', 'Cliente inativado por baixa', false);
  end if;
  perform app.soc_evento(p_proc, 'status', 'Processo concluído', true);
end $$;

-- ------------------------------------------------------------------------------------- 5) M-3 arquivos
drop policy if exists hub_arquivos_equipe on public.hub_arquivos;
create policy hub_arquivos_equipe_select on public.hub_arquivos for select to authenticated
  using (org_id in (select app.minhas_orgs()) and app.papel(org_id) <> 'tv');
create policy hub_arquivos_equipe_insert on public.hub_arquivos for insert to authenticated
  with check (org_id in (select app.minhas_orgs()) and app.papel(org_id) <> 'tv');
create policy hub_arquivos_equipe_update on public.hub_arquivos for update to authenticated
  using (org_id in (select app.minhas_orgs()) and app.papel(org_id) <> 'tv')
  with check (org_id in (select app.minhas_orgs()) and app.papel(org_id) <> 'tv');
create policy hub_arquivos_equipe_delete on public.hub_arquivos for delete to authenticated
  using (org_id in (select app.minhas_orgs()) and (app.eh_gestor(org_id) or enviado_por = auth.uid()));

create or replace function app.tg_arquivo_imutavel()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.caminho is distinct from old.caminho or new.org_id is distinct from old.org_id
     or new.cliente_id is distinct from old.cliente_id then
    raise exception 'Arquivo já enviado: caminho, organização e cliente não mudam (envie de novo)';
  end if;
  return new;
end $$;
drop trigger if exists hub_arquivos_imutavel on public.hub_arquivos;
create trigger hub_arquivos_imutavel before update on public.hub_arquivos
  for each row execute function app.tg_arquivo_imutavel();

drop policy if exists hub_storage_equipe_select on storage.objects;
drop policy if exists hub_storage_equipe_insert on storage.objects;
drop policy if exists hub_storage_equipe_delete on storage.objects;
create policy hub_storage_equipe_select on storage.objects for select to authenticated
  using (bucket_id = 'hub-arquivos' and app.uuid_ou_nulo((storage.foldername(name))[1]) in (select app.minhas_orgs())
         and app.papel(app.uuid_ou_nulo((storage.foldername(name))[1])) <> 'tv');
create policy hub_storage_equipe_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'hub-arquivos' and app.uuid_ou_nulo((storage.foldername(name))[1]) in (select app.minhas_orgs())
         and app.papel(app.uuid_ou_nulo((storage.foldername(name))[1])) <> 'tv');
create policy hub_storage_equipe_delete on storage.objects for delete to authenticated
  using (bucket_id = 'hub-arquivos' and app.eh_gestor(app.uuid_ou_nulo((storage.foldername(name))[1])));

-- ------------------------------------------------------------------------------------- 6) M-4 funções internas
revoke execute on all functions in schema app from public, anon, authenticated;
alter default privileges in schema app revoke execute on functions from public;
grant execute on function app.minhas_orgs(), app.papel(uuid), app.meu_setor(uuid), app.eh_gestor(uuid),
  app.hoje(uuid), app.hub_pode(uuid, text, text), app.hub_peso(text), app.portal_pode(uuid, text),
  app.equipe_do_cliente(uuid, text, text), app.uuid_ou_nulo(text) to authenticated;
revoke usage on schema app from anon;

-- ------------------------------------------------------------------------------------- 7) temporários
do $$ begin
  if to_regprocedure('public.hub_receber_arquivo_temp(text,text)') is not null then
    revoke all on function public.hub_receber_arquivo_temp(text, text) from public, anon, authenticated;
  end if;
  if to_regprocedure('public.hub_ler_arquivo_temp(text)') is not null then
    revoke all on function public.hub_ler_arquivo_temp(text) from public, anon, authenticated;
  end if;
end $$;

-- ------------------------------------------------------------------------------------- 8) descrições
comment on table public.organizacoes        is 'Empresa que usa o HUB (a MDC é a primeira). Tudo no banco é separado por org_id.';
comment on table public.membros             is 'Equipe da organização: papel (admin, gestor, analista, tv), setor e perfil de acesso.';
comment on table public.setores             is 'Setores da organização (Fiscal, Contábil, DP, Societário...). Usados em tarefas e responsáveis.';
comment on table public.feriados            is 'Feriados da organização; o cálculo de prazo útil (app.dia_util) pula estas datas.';
comment on table public.clientes            is 'Carteira de clientes (importada do Domínio): regime, segmento, grupos e situação.';
comment on table public.cliente_responsaveis is 'Responsável de cada cliente por setor; tarefas recorrentes nascem atribuídas a ele.';
comment on table public.tarefas             is 'Tarefas da equipe (manuais, recorrentes por modelo ou geradas pelo Societário).';
comment on table public.comentarios         is 'Comentários dentro de uma tarefa.';
comment on table public.historico           is 'Histórico automático de cada mudança de tarefa (gatilho tarefas_historico).';
comment on table public.modelos_recorrentes is 'Obrigações recorrentes: geram tarefas todo mês por regime, segmento e grupo do cliente.';
comment on table public.hub_apps            is 'Catálogo de ferramentas do HUB (slug = nome usado nas permissões).';
comment on table public.hub_acessos         is 'Acesso de cada pessoa a cada ferramenta (ver, operar, gerir). Mantido pelo perfil.';
comment on table public.hub_perfis          is 'Perfis de acesso (conjunto de ferramentas e níveis). Trocar o perfil regrava hub_acessos.';
comment on table public.hub_auditoria       is 'Registro de ações sensíveis (quem, quando, antes e depois). Só leitura pela tela.';
comment on table public.hub_notificacoes    is 'Avisos do sino do HUB.';
comment on table public.hub_arquivos        is 'Arquivos enviados (Storage hub-arquivos, pasta = org_id), ligados a tarefa, processo ou conversa.';
comment on table public.hub_certificados    is 'Certificado digital A1 da organização: só metadados; arquivo e senha ficam no Supabase Vault.';
comment on table public.soc_tipos           is 'Tipos de processo societário (alteração, abertura, baixa...) e suas fases padrão.';
comment on table public.soc_processos       is 'Processos societários em andamento ou concluídos.';
comment on table public.soc_fases           is 'Fases de cada processo societário; cada fase pode gerar uma tarefa.';
comment on table public.soc_exigencias      is 'Exigências de órgãos (Junta, Receita, prefeitura) num processo.';
comment on table public.soc_protocolos      is 'Protocolos registrados num processo.';
comment on table public.soc_taxas           is 'Taxas e guias de um processo societário.';
comment on table public.soc_eventos         is 'Linha do tempo do processo (o que é visível ao cliente aparece no Portal).';
comment on table public.portal_usuarios     is 'Pessoas do cliente com acesso ao Portal (uma linha por empresa). Criadas só por convite.';
comment on table public.portal_convites     is 'Convites pendentes do Portal (e-mail ainda sem conta).';
comment on table public.portal_conversas    is 'Conversas do Atendimento (chat cliente × MDC).';
comment on table public.portal_mensagens    is 'Mensagens das conversas do Atendimento.';
comment on table public.portal_balancetes   is 'Balancete importado do Domínio por competência, com resumo, índices e demonstrações calculados. Publicado = visível ao cliente.';
comment on table public.portal_balancete_linhas is 'Linhas do balancete (conta, saldos). Travadas quando o balancete está publicado.';
comment on table public.portal_mapa_contas  is 'Classificação contábil → grupo das demonstrações (cliente_id nulo = regra da organização).';
comment on table public.portal_mapa_dfc     is 'Classificação contábil → linha da DFC (cliente_id nulo = regra da organização).';
comment on table public.portal_pareceres    is 'Parecer técnico do contador sobre um balancete (versões, publicação).';
comment on table public.venc_itens          is 'Itens que vencem (certificado, alvará, procuração...) com avisos 60/30/7 dias.';
comment on table public.crm_oportunidades   is 'Funil comercial: leads e oportunidades (arquivadas = não avançaram).';
comment on table public.crm_atividades      is 'Atividades de cada oportunidade (ligação, reunião, tarefa).';
comment on table public.crm_modelos         is 'Modelos de contrato do Comercial (texto base com variáveis).';
comment on table public.crm_contratos       is 'Contratos gerados a partir do modelo para uma oportunidade.';

comment on function app.hub_pode(uuid, text, text) is
  'Regra única de acesso da equipe: admin = tudo; senão hub_acessos (ver < operar < gerir), respeitando expira_em. Usada pelas políticas RLS.';
comment on function app.portal_pode(uuid, text) is
  'Regra de acesso do usuário do cliente: vínculo ativo em portal_usuarios, permissão pedida e cliente ativo (ou no mês de saída).';
comment on function app.minhas_orgs() is 'Organizações em que o usuário logado é membro ativo.';
comment on function app.papel(uuid) is 'Papel do usuário logado na organização (admin, gestor, analista, tv) ou nulo.';
comment on function app.eh_gestor(uuid) is 'Verdadeiro para admin ou gestor da organização.';
