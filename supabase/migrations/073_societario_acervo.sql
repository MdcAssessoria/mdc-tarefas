-- =====================================================================================================
--  073 · Societário: acervo de documentos dos clientes (pedido do Edvaldo, 13/11/2026)
--
--  Cada cliente ganha um acervo permanente de documentos societários (contrato social, alterações, consolidação,
--  cartão CNPJ, documentos dos sócios, procurações, atas, certidões, inscrições e alvarás), separado dos anexos de
--  um processo. O arquivo continua em hub_arquivos/Storage (bucket hub-arquivos); soc_documentos guarda a ficha:
--  categoria, data, número do registro na Junta, de qual processo veio e se ainda vale (vigente) ou foi substituído.
--
--  Amarração com os processos: a ficha do processo mostra o acervo vigente do cliente como base (alteração parte do
--  contrato e da última consolidação) e qualquer anexo do processo pode ir para o acervo ("Guardar no acervo"),
--  substituindo o documento anterior da mesma categoria — assim a alteração registrada vira a base da próxima.
--
--  Regras (no banco): só grava por soc_documento_guardar (societario › operar); muda a ficha por
--  soc_documento_editar (operar) e tira do acervo por soc_documento_retirar (gerir, motivo de 5 letras). Nada se
--  apaga; tudo vai para a auditoria e, quando há processo, para a linha do tempo.
-- =====================================================================================================

create table if not exists public.soc_documentos (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references public.organizacoes(id) on delete cascade,
  cliente_id       uuid not null references public.clientes(id),
  arquivo_id       uuid not null unique references public.hub_arquivos(id),
  categoria        text not null check (categoria in (
                     'contrato_social', 'alteracao_contratual', 'consolidacao', 'cartao_cnpj', 'documento_socio',
                     'procuracao', 'ata', 'certidao', 'inscricao', 'alvara', 'outro')),
  descricao        text check (descricao is null or length(descricao) <= 300),
  data_documento   date,
  registro         text check (registro is null or length(registro) <= 80),   -- NIRE, nº de arquivamento, protocolo
  processo_id      uuid references public.soc_processos(id) on delete set null,
  vigente          boolean not null default true,
  substituido_por  uuid references public.soc_documentos(id),
  substituido_em   timestamptz,
  retirado_em      timestamptz,
  retirado_por     uuid references auth.users(id) on delete set null,
  retirado_motivo  text,
  criado_por       uuid references auth.users(id) on delete set null default auth.uid(),
  criado_em        timestamptz not null default now()
);
create index if not exists soc_documentos_cliente on public.soc_documentos (org_id, cliente_id, categoria);
create index if not exists soc_documentos_processo on public.soc_documentos (processo_id);
comment on table public.soc_documentos is
  'Acervo de documentos societários do cliente (073): ficha do documento; o arquivo fica em hub_arquivos. Grava só pelas funções soc_documento_*.';

alter table public.soc_documentos enable row level security;
drop policy if exists soc_documentos_select on public.soc_documentos;
create policy soc_documentos_select on public.soc_documentos for select to authenticated
  using ((select app.hub_pode(org_id, 'societario', 'ver')));
-- sem política de insert/update/delete: só as funções abaixo gravam
revoke insert, update, delete on public.soc_documentos from authenticated, anon;
grant select on public.soc_documentos to authenticated;

create or replace function app.soc_categoria_nome(p text)
returns text language sql immutable set search_path = '' as $$
  select case p
    when 'contrato_social' then 'Contrato social' when 'alteracao_contratual' then 'Alteração contratual'
    when 'consolidacao' then 'Contrato consolidado' when 'cartao_cnpj' then 'Cartão CNPJ'
    when 'documento_socio' then 'Documento de sócio' when 'procuracao' then 'Procuração' when 'ata' then 'Ata'
    when 'certidao' then 'Certidão' when 'inscricao' then 'Inscrição estadual ou municipal' when 'alvara' then 'Alvará'
    else 'Outro documento' end
$$;

/**
 * Guarda um arquivo já enviado (hub_arquivos) no acervo do cliente. Vale para anexo do processo (o cliente vem do
 * processo) e para arquivo enviado direto no acervo (o cliente vem do arquivo). p_substitui marca o documento
 * vigente anterior como substituído (mesmo cliente). Devolve o id da ficha.
 */
create or replace function public.soc_documento_guardar(
  p_arquivo uuid, p_categoria text, p_descricao text default null, p_data date default null,
  p_registro text default null, p_processo uuid default null, p_substitui uuid default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare a hub_arquivos; p soc_processos; v_cliente uuid; v_id uuid; s soc_documentos;
begin
  select * into a from hub_arquivos where id = p_arquivo for update;
  if a.id is null then raise exception 'Arquivo não encontrado'; end if;
  if not app.hub_pode(a.org_id, 'societario', 'operar') then
    raise exception 'Você não tem permissão para guardar documentos no acervo do Societário';
  end if;
  if a.retirado_em is not null then raise exception 'Este arquivo foi retirado e não pode ir para o acervo'; end if;
  if exists (select 1 from soc_documentos where arquivo_id = a.id) then raise exception 'Este arquivo já está no acervo'; end if;
  if p_categoria is null or app.soc_categoria_nome(p_categoria) = 'Outro documento' and p_categoria <> 'outro' then
    raise exception 'Escolha o tipo do documento';
  end if;

  if p_processo is not null then
    select * into p from soc_processos where id = p_processo;
    if p.id is null or p.org_id <> a.org_id then raise exception 'Processo não encontrado'; end if;
    if p.cliente_id is null then raise exception 'Ligue o processo a um cliente antes de guardar documentos no acervo'; end if;
    if a.ref_id is distinct from p.id and a.cliente_id is distinct from p.cliente_id then
      raise exception 'Este arquivo não é deste processo nem deste cliente';
    end if;
    v_cliente := p.cliente_id;
  else
    v_cliente := a.cliente_id;
    if v_cliente is null then raise exception 'Escolha o cliente do documento'; end if;
  end if;
  if not exists (select 1 from clientes where id = v_cliente and org_id = a.org_id) then
    raise exception 'Cliente não pertence a esta organização';
  end if;

  if p_substitui is not null then
    select * into s from soc_documentos where id = p_substitui for update;
    if s.id is null or s.org_id <> a.org_id or s.cliente_id <> v_cliente then
      raise exception 'O documento substituído precisa ser do mesmo cliente';
    end if;
    if not s.vigente then raise exception 'O documento escolhido já não está vigente'; end if;
  end if;

  insert into soc_documentos (org_id, cliente_id, arquivo_id, categoria, descricao, data_documento, registro, processo_id)
  values (a.org_id, v_cliente, a.id, p_categoria, nullif(trim(coalesce(p_descricao, '')), ''), p_data,
          nullif(trim(coalesce(p_registro, '')), ''), p_processo)
  returning id into v_id;

  if s.id is not null then
    update soc_documentos set vigente = false, substituido_por = v_id, substituido_em = now() where id = s.id;
  end if;

  perform app.registrar(a.org_id, 'societario', 'acervo_guardar', v_id::text, null,
    jsonb_build_object('cliente', v_cliente, 'arquivo', a.nome, 'categoria', p_categoria, 'processo', p_processo, 'substitui', p_substitui));
  if p_processo is not null then
    perform app.soc_evento(p_processo, 'documento',
      format('Guardado no acervo do cliente como %s: %s', lower(app.soc_categoria_nome(p_categoria)), a.nome));
  end if;
  return v_id;
end $$;

/** Corrige a ficha (tipo, descrição, data, registro e se está vigente). Arquivo e cliente não mudam. */
create or replace function public.soc_documento_editar(
  p_doc uuid, p_categoria text, p_descricao text, p_data date, p_registro text, p_vigente boolean)
returns void language plpgsql security definer set search_path = public as $$
declare d soc_documentos;
begin
  select * into d from soc_documentos where id = p_doc for update;
  if d.id is null or d.retirado_em is not null then raise exception 'Documento não encontrado no acervo'; end if;
  if not app.hub_pode(d.org_id, 'societario', 'operar') then
    raise exception 'Você não tem permissão para alterar o acervo do Societário';
  end if;
  if p_categoria is null or app.soc_categoria_nome(p_categoria) = 'Outro documento' and p_categoria <> 'outro' then
    raise exception 'Escolha o tipo do documento';
  end if;
  update soc_documentos
     set categoria = p_categoria, descricao = nullif(trim(coalesce(p_descricao, '')), ''), data_documento = p_data,
         registro = nullif(trim(coalesce(p_registro, '')), ''), vigente = coalesce(p_vigente, vigente),
         substituido_por = case when coalesce(p_vigente, vigente) then null else substituido_por end,
         substituido_em = case when coalesce(p_vigente, vigente) then null else coalesce(substituido_em, now()) end
   where id = d.id;
  perform app.registrar(d.org_id, 'societario', 'acervo_editar', d.id::text,
    jsonb_build_object('categoria', d.categoria, 'descricao', d.descricao, 'data', d.data_documento, 'registro', d.registro, 'vigente', d.vigente),
    jsonb_build_object('categoria', p_categoria, 'descricao', p_descricao, 'data', p_data, 'registro', p_registro, 'vigente', p_vigente));
end $$;

/** Tira o documento do acervo (societario › gerir, motivo com 5 letras). A ficha e o arquivo ficam guardados. */
create or replace function public.soc_documento_retirar(p_doc uuid, p_motivo text)
returns void language plpgsql security definer set search_path = public as $$
declare d soc_documentos; v_motivo text := trim(coalesce(p_motivo, ''));
begin
  select * into d from soc_documentos where id = p_doc for update;
  if d.id is null then raise exception 'Documento não encontrado no acervo'; end if;
  if not app.hub_pode(d.org_id, 'societario', 'gerir') then
    raise exception 'Só quem gerencia o Societário tira documentos do acervo';
  end if;
  if d.retirado_em is not null then raise exception 'Este documento já saiu do acervo'; end if;
  if length(regexp_replace(v_motivo, '[^[:alpha:]]', '', 'g')) < 5 then
    raise exception 'Informe o motivo (pelo menos 5 letras)';
  end if;
  update soc_documentos set retirado_em = now(), retirado_por = auth.uid(), retirado_motivo = v_motivo, vigente = false
   where id = d.id;
  perform app.registrar(d.org_id, 'societario', 'acervo_retirar', d.id::text,
    jsonb_build_object('categoria', d.categoria, 'cliente', d.cliente_id, 'arquivo', d.arquivo_id), jsonb_build_object('motivo', v_motivo));
end $$;

revoke all on function public.soc_documento_guardar(uuid, text, text, date, text, uuid, uuid) from public, anon;
revoke all on function public.soc_documento_editar(uuid, text, text, date, text, boolean) from public, anon;
revoke all on function public.soc_documento_retirar(uuid, text) from public, anon;
revoke all on function app.soc_categoria_nome(text) from public, anon, authenticated;
grant execute on function public.soc_documento_guardar(uuid, text, text, date, text, uuid, uuid) to authenticated;
grant execute on function public.soc_documento_editar(uuid, text, text, date, text, boolean) to authenticated;
grant execute on function public.soc_documento_retirar(uuid, text) to authenticated;
comment on function public.soc_documento_guardar(uuid, text, text, date, text, uuid, uuid) is
  'Guarda um arquivo no acervo societário do cliente (operar); substitui o anterior se pedido; audita e registra no processo (073).';
