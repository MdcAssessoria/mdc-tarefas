-- =====================================================================================================
--  085 · Contrato de licença do Ledgra e do HUB-MDC (pedido do Edvaldo, 15/11/2026)
--
--  Um contrato (documento) por licença. O texto vem do modelo de cláusulas da organização (editável, com versões)
--  preenchido na tela; ao EMITIR, o banco numera (LIC-AAAA/NNNN), guarda a fotografia do texto e o código de
--  integridade (SHA-256). A MDC escolhe como o cliente assina:
--    · impresso: baixa o PDF, colhe a assinatura fora do HUB e registra a data aqui;
--    · eletrônico: gera um link (vale 15 dias); o cliente abre sem login, lê, informa nome e CPF (precisa ser o CPF
--      indicado) e marca "Li e concordo". O banco grava data e hora, IP e navegador (MP 2.200-2/2001, art. 10, § 2º).
--  Emitir, ver e assinar exigem a permissão de valores (gerir), porque o texto traz o preço. O link guarda só o hash do token; 10 tentativas com CPF errado travam o link. Situação só muda por função.
-- =====================================================================================================

-- ------------------------------------------------------------------------------------- CPF
create or replace function app.cpf_valido(p text)
returns boolean language plpgsql immutable set search_path = '' as $$
declare d text := regexp_replace(coalesce(p, ''), '\D', '', 'g'); s int; r int; i int;
begin
  if length(d) <> 11 or d ~ '^(\d)\1{10}$' then return false; end if;
  s := 0; for i in 1..9 loop s := s + substr(d, i, 1)::int * (11 - i); end loop;
  r := (s * 10) % 11; if r = 10 then r := 0; end if;
  if r <> substr(d, 10, 1)::int then return false; end if;
  s := 0; for i in 1..10 loop s := s + substr(d, i, 1)::int * (12 - i); end loop;
  r := (s * 10) % 11; if r = 10 then r := 0; end if;
  return r = substr(d, 11, 1)::int;
end $$;
revoke all on function app.cpf_valido(text) from public, anon, authenticated;

-- ------------------------------------------------------------------------------------- modelo
create table if not exists public.lic_contrato_modelo (
  org_id uuid primary key references public.organizacoes(id) on delete cascade,
  texto text not null,
  versao int not null default 1,
  atualizado_por uuid,
  atualizado_em timestamptz not null default now()
);
comment on table public.lic_contrato_modelo is
  'Modelo de cláusulas do contrato de licença (markdown simples com variáveis {{assim}}). Sem linha = o modelo-padrão do HUB.';

create table if not exists public.lic_contrato_modelo_versoes (
  org_id uuid not null references public.organizacoes(id) on delete cascade,
  versao int not null,
  texto text not null,
  por uuid,
  em timestamptz not null default now(),
  primary key (org_id, versao)
);
comment on table public.lic_contrato_modelo_versoes is 'Histórico das versões do modelo do contrato de licença.';

-- ------------------------------------------------------------------------------------- contrato emitido
create table if not exists public.lic_contrato_documentos (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizacoes(id) on delete cascade,
  contrato_id uuid not null references public.lic_contratos(id) on delete restrict,
  numero text not null,
  modelo_versao int not null default 0,
  texto text not null,
  hash text not null,
  signatario jsonb not null,
  modo text not null check (modo in ('impresso', 'eletronico')),
  situacao text not null default 'emitido' check (situacao in ('emitido', 'enviado', 'assinado', 'cancelado')),
  emitido_por uuid,
  emitido_em timestamptz not null default now(),
  link_hash text,
  link_expira_em timestamptz,
  link_tentativas int not null default 0,
  assinado_em timestamptz,
  assinatura jsonb,
  cancelado_em timestamptz,
  cancelado_por uuid,
  cancelado_motivo text,
  unique (org_id, numero),
  check (situacao <> 'assinado' or (assinado_em is not null and assinatura is not null)),
  check (situacao <> 'cancelado' or (cancelado_em is not null and coalesce(trim(cancelado_motivo), '') <> ''))
);
create unique index if not exists lic_contrato_documentos_um_ativo
  on public.lic_contrato_documentos (contrato_id) where situacao <> 'cancelado';
create unique index if not exists lic_contrato_documentos_link on public.lic_contrato_documentos (link_hash) where link_hash is not null;
comment on table public.lic_contrato_documentos is
  'Contrato de licença emitido (fotografia do texto + SHA-256), um ativo por licença. Assinatura impressa (data registrada) ou eletrônica (link com nome, CPF, IP e navegador). Cancela com motivo, não apaga.';

-- leitura de quem vê Licenças; gravação só pelas funções abaixo
do $$
declare t text;
begin
  foreach t in array array['lic_contrato_modelo', 'lic_contrato_modelo_versoes'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists lic_ver on public.%I', t);
    execute format('create policy lic_ver on public.%I for select to authenticated using ((select app.hub_pode(org_id, ''licencas'', ''ver'')))', t);
    execute format('revoke insert, update, delete on public.%I from anon, authenticated', t);
  end loop;
end $$;
-- o contrato traz o valor da licença: só quem tem a permissão de valores (gerir, 074) lê, emite e assina
alter table public.lic_contrato_documentos enable row level security;
drop policy if exists lic_valores_ver on public.lic_contrato_documentos;
create policy lic_valores_ver on public.lic_contrato_documentos for select to authenticated
  using ((select app.hub_pode(org_id, 'licencas', 'gerir')));
revoke insert, update, delete on public.lic_contrato_documentos from anon, authenticated;
-- o hash do link não sai pela API nem para a equipe
revoke select on public.lic_contrato_documentos from anon, authenticated;
grant select (id, org_id, contrato_id, numero, modelo_versao, texto, hash, signatario, modo, situacao, emitido_por, emitido_em,
              link_expira_em, assinado_em, assinatura, cancelado_em, cancelado_por, cancelado_motivo)
  on public.lic_contrato_documentos to authenticated;

-- ------------------------------------------------------------------------------------- gravar o modelo (gerir)
create or replace function public.lic_contrato_modelo_salvar(p_org uuid, p_texto text)
returns int language plpgsql security definer set search_path = public as $$
declare v int;
begin
  if not app.hub_pode(p_org, 'licencas', 'gerir') then raise exception 'Sem permissão para mudar o modelo do contrato'; end if;
  if char_length(trim(coalesce(p_texto, ''))) < 200 then raise exception 'O modelo está curto demais. Confira se o texto inteiro foi colado.'; end if;
  if char_length(p_texto) > 100000 then raise exception 'O modelo passou do tamanho máximo (100 mil letras).'; end if;
  if p_texto !~ '\{\{\s*contratante_razao\s*\}\}' then raise exception 'O modelo precisa ter {{contratante_razao}} (o nome do cliente).'; end if;
  insert into lic_contrato_modelo as m (org_id, texto, versao, atualizado_por)
  values (p_org, p_texto, 1, auth.uid())
  on conflict (org_id) do update set texto = excluded.texto, versao = m.versao + 1, atualizado_por = auth.uid(), atualizado_em = now()
  returning versao into v;
  insert into lic_contrato_modelo_versoes (org_id, versao, texto, por) values (p_org, v, p_texto, auth.uid());
  perform app.registrar(p_org, 'licencas', 'modelo_contrato', p_org::text, null, jsonb_build_object('versao', v));
  return v;
end $$;

-- ------------------------------------------------------------------------------------- emitir (gerir)
create or replace function public.lic_documento_emitir(p_contrato uuid, p_texto text, p_modelo_versao int, p_signatario jsonb, p_modo text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare k lic_contratos; v_ano int; v_seq int; v_num text; v_texto text; v_id uuid; v_sig jsonb;
begin
  select * into k from lic_contratos where id = p_contrato;
  if k.id is null then raise exception 'Licença não encontrada'; end if;
  if not app.hub_pode(k.org_id, 'licencas', 'gerir') then raise exception 'Sem permissão para emitir o contrato (precisa da permissão de valores das licenças)'; end if;
  if k.situacao <> 'ativo' then raise exception 'Esta licença está encerrada: não dá para emitir contrato'; end if;
  if coalesce(p_modo, '') not in ('impresso', 'eletronico') then raise exception 'Escolha como o cliente vai assinar'; end if;
  if exists (select 1 from lic_contrato_documentos where contrato_id = p_contrato and situacao <> 'cancelado') then
    raise exception 'Esta licença já tem contrato emitido. Para emitir outro, cancele o atual com o motivo.';
  end if;
  v_sig := jsonb_build_object(
    'nome', trim(coalesce(p_signatario->>'nome', '')),
    'cpf', regexp_replace(coalesce(p_signatario->>'cpf', ''), '\D', '', 'g'),
    'cargo', trim(coalesce(p_signatario->>'cargo', '')),
    'email', lower(trim(coalesce(p_signatario->>'email', ''))));
  if array_length(regexp_split_to_array(v_sig->>'nome', '\s+'), 1) < 2 then raise exception 'Preencha o nome completo de quem vai assinar pelo cliente'; end if;
  if not app.cpf_valido(v_sig->>'cpf') then raise exception 'Preencha o CPF de quem vai assinar (CPF válido)'; end if;
  if char_length(trim(coalesce(p_texto, ''))) < 200 then raise exception 'O texto do contrato está vazio ou curto demais'; end if;
  if char_length(p_texto) > 150000 then raise exception 'O texto do contrato passou do tamanho máximo'; end if;

  -- número sem repetir, mesmo com duas pessoas emitindo ao mesmo tempo
  v_ano := extract(year from app.hoje(k.org_id))::int;
  perform pg_advisory_xact_lock(hashtext('lic_documento:' || k.org_id::text || ':' || v_ano));
  select coalesce(max(split_part(numero, '/', 2)::int), 0) + 1 into v_seq
    from lic_contrato_documentos where org_id = k.org_id and numero like 'LIC-' || v_ano || '/%';
  v_num := 'LIC-' || v_ano || '/' || lpad(v_seq::text, 4, '0');

  v_texto := regexp_replace(p_texto, '\{\{\s*numero\s*\}\}', v_num, 'g');
  if v_texto ~ '\{\{' then raise exception 'O texto ainda tem variável sem preencher ({{…}}). Confira o modelo do contrato.'; end if;

  insert into lic_contrato_documentos (org_id, contrato_id, numero, modelo_versao, texto, hash, signatario, modo, emitido_por)
  values (k.org_id, k.id, v_num, coalesce(p_modelo_versao, 0), v_texto, encode(extensions.digest(v_texto, 'sha256'), 'hex'),
          v_sig, p_modo, auth.uid())
  returning id into v_id;
  perform app.registrar(k.org_id, 'licencas', 'emitir_contrato', v_id::text, null,
    jsonb_build_object('numero', v_num, 'contrato', k.id, 'modo', p_modo));
  return jsonb_build_object('id', v_id, 'numero', v_num);
end $$;

-- ------------------------------------------------------------------------------------- link de assinatura (gerir)
create or replace function public.lic_documento_link(p_doc uuid)
returns text language plpgsql security definer set search_path = public as $$
declare d lic_contrato_documentos; v_token text;
begin
  select * into d from lic_contrato_documentos where id = p_doc for update;
  if d.id is null then raise exception 'Contrato não encontrado'; end if;
  if not app.hub_pode(d.org_id, 'licencas', 'gerir') then raise exception 'Sem permissão para gerar o link de assinatura'; end if;
  if d.modo <> 'eletronico' then raise exception 'Este contrato foi emitido para assinatura em papel. Registre a assinatura quando voltar assinado.'; end if;
  if d.situacao not in ('emitido', 'enviado') then raise exception 'Este contrato não está esperando assinatura'; end if;
  v_token := encode(extensions.gen_random_bytes(24), 'hex');
  update lic_contrato_documentos
     set link_hash = encode(extensions.digest(v_token, 'sha256'), 'hex'), link_expira_em = now() + interval '15 days',
         link_tentativas = 0, situacao = 'enviado'
   where id = p_doc;
  perform app.registrar(d.org_id, 'licencas', 'link_contrato', p_doc::text, null, jsonb_build_object('numero', d.numero));
  return v_token;
end $$;
comment on function public.lic_documento_link(uuid) is
  'Gera o link de assinatura (15 dias). O token sai uma vez só; o banco guarda o hash. Gerar de novo invalida o anterior.';

-- ------------------------------------------------------------------------------------- assinatura em papel (gerir)
create or replace function public.lic_documento_assinatura_registrar(p_doc uuid, p_data date, p_observacao text default null)
returns void language plpgsql security definer set search_path = public as $$
declare d lic_contrato_documentos;
begin
  select * into d from lic_contrato_documentos where id = p_doc for update;
  if d.id is null then raise exception 'Contrato não encontrado'; end if;
  if not app.hub_pode(d.org_id, 'licencas', 'gerir') then raise exception 'Sem permissão para registrar a assinatura'; end if;
  if d.situacao not in ('emitido', 'enviado') then raise exception 'Este contrato não está esperando assinatura'; end if;
  if p_data is null then raise exception 'Informe a data em que o cliente assinou'; end if;
  if p_data > app.hoje(d.org_id) then raise exception 'A data da assinatura não pode ser depois de hoje'; end if;
  if p_data < (d.emitido_em at time zone 'America/Sao_Paulo')::date then raise exception 'A data da assinatura não pode ser antes da emissão do contrato'; end if;
  update lic_contrato_documentos
     set situacao = 'assinado', assinado_em = now(), link_hash = null, link_expira_em = null,
         assinatura = jsonb_build_object('tipo', 'impresso', 'data', p_data, 'observacao', nullif(trim(coalesce(p_observacao, '')), ''),
                                         'registrado_por', auth.uid())
   where id = p_doc;
  perform app.registrar(d.org_id, 'licencas', 'assinatura_contrato', p_doc::text, null, jsonb_build_object('numero', d.numero, 'tipo', 'impresso'));
end $$;

-- ------------------------------------------------------------------------------------- cancelar
create or replace function public.lic_documento_cancelar(p_doc uuid, p_motivo text)
returns void language plpgsql security definer set search_path = public as $$
declare d lic_contrato_documentos;
begin
  select * into d from lic_contrato_documentos where id = p_doc for update;
  if d.id is null then raise exception 'Contrato não encontrado'; end if;
  if not app.hub_pode(d.org_id, 'licencas', 'gerir') then
    raise exception 'Sem permissão para cancelar este contrato';
  end if;
  if d.situacao = 'cancelado' then raise exception 'Este contrato já foi cancelado'; end if;
  if char_length(trim(coalesce(p_motivo, ''))) < 5 then raise exception 'Explique o motivo (mínimo 5 letras)'; end if;
  update lic_contrato_documentos
     set situacao = 'cancelado', cancelado_em = now(), cancelado_por = auth.uid(), cancelado_motivo = trim(p_motivo),
         link_hash = null, link_expira_em = null
   where id = p_doc;
  perform app.registrar(d.org_id, 'licencas', 'cancelar_contrato', p_doc::text, null, jsonb_build_object('numero', d.numero, 'motivo', trim(p_motivo)));
end $$;

-- ------------------------------------------------------------------------------------- página pública do link
create or replace function public.lic_assinatura_abrir(p_token text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare d lic_contrato_documentos; v_cli text;
begin
  if coalesce(p_token, '') !~ '^[0-9a-f]{48}$' then return jsonb_build_object('situacao', 'invalido'); end if;
  select * into d from lic_contrato_documentos where link_hash = encode(extensions.digest(p_token, 'sha256'), 'hex');
  if d.id is null then return jsonb_build_object('situacao', 'invalido'); end if;
  select c.razao_social into v_cli from lic_contratos k join clientes c on c.id = k.cliente_id where k.id = d.contrato_id;
  return jsonb_build_object(
    'situacao', case when d.situacao = 'enviado' and d.link_expira_em < now() then 'expirado'
                     when d.situacao = 'enviado' and d.link_tentativas >= 10 then 'travado' else d.situacao end,
    'numero', d.numero, 'cliente', v_cli, 'texto', d.texto, 'hash', d.hash,
    'signatario', d.signatario->>'nome',
    'cpf_final', right(d.signatario->>'cpf', 2),
    'assinado_em', d.assinado_em, 'assinatura', d.assinatura);
end $$;

create or replace function public.lic_assinatura_aceitar(p_token text, p_nome text, p_cpf text, p_concordo boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare d lic_contrato_documentos; v_cab json; v_ip text; v_ua text; v_cpf text := regexp_replace(coalesce(p_cpf, ''), '\D', '', 'g');
begin
  if coalesce(p_token, '') !~ '^[0-9a-f]{48}$' then raise exception 'Link inválido. Peça um link novo à MDC.'; end if;
  select * into d from lic_contrato_documentos where link_hash = encode(extensions.digest(p_token, 'sha256'), 'hex') for update;
  if d.id is null then raise exception 'Link inválido. Peça um link novo à MDC.'; end if;
  if d.situacao = 'assinado' then raise exception 'Este contrato já foi assinado.'; end if;
  if d.situacao <> 'enviado' then raise exception 'Este contrato não está mais esperando assinatura.'; end if;
  if d.link_expira_em < now() then raise exception 'O link venceu. Peça um link novo à MDC.'; end if;
  if d.link_tentativas >= 10 then raise exception 'Muitas tentativas com CPF errado. Peça um link novo à MDC.'; end if;
  if not coalesce(p_concordo, false) then raise exception 'Marque "Li e concordo" para assinar.'; end if;
  if array_length(regexp_split_to_array(trim(coalesce(p_nome, '')), '\s+'), 1) < 2 then raise exception 'Escreva o seu nome completo.'; end if;
  if v_cpf <> d.signatario->>'cpf' then
    -- devolve o erro em vez de levantar exceção, para a tentativa errada ficar gravada (exceção desfaria o update)
    update lic_contrato_documentos set link_tentativas = link_tentativas + 1 where id = d.id;
    return jsonb_build_object('ok', false, 'erro', 'O CPF não confere com o de quem foi indicado para assinar este contrato.',
                              'restam', greatest(0, 9 - d.link_tentativas));
  end if;
  begin v_cab := current_setting('request.headers', true)::json; exception when others then v_cab := null; end;
  v_ip := nullif(trim(split_part(coalesce(v_cab->>'x-forwarded-for', v_cab->>'x-real-ip', ''), ',', 1)), '');
  v_ua := left(nullif(v_cab->>'user-agent', ''), 300);
  update lic_contrato_documentos
     set situacao = 'assinado', assinado_em = now(), link_expira_em = null,
         assinatura = jsonb_build_object('tipo', 'eletronico', 'nome', trim(p_nome), 'cpf', v_cpf, 'ip', v_ip,
                                         'navegador', v_ua, 'em', now())
   where id = d.id;
  perform app.registrar(d.org_id, 'licencas', 'assinatura_contrato', d.id::text, null,
    jsonb_build_object('numero', d.numero, 'tipo', 'eletronico', 'ip', v_ip));
  return jsonb_build_object('ok', true, 'numero', d.numero);
end $$;
comment on function public.lic_assinatura_aceitar(text, text, text, boolean) is
  'Assinatura pelo link (sem login): confere o token, o CPF indicado e o "Li e concordo"; grava nome, CPF, IP, navegador e hora. CPF errado conta tentativa (10 travam).';

-- ------------------------------------------------------------------------------------- acesso às funções
revoke all on function public.lic_contrato_modelo_salvar(uuid, text), public.lic_documento_emitir(uuid, text, int, jsonb, text),
  public.lic_documento_link(uuid), public.lic_documento_assinatura_registrar(uuid, date, text), public.lic_documento_cancelar(uuid, text),
  public.lic_assinatura_abrir(text), public.lic_assinatura_aceitar(text, text, text, boolean) from public, anon;
grant execute on function public.lic_contrato_modelo_salvar(uuid, text), public.lic_documento_emitir(uuid, text, int, jsonb, text),
  public.lic_documento_link(uuid), public.lic_documento_assinatura_registrar(uuid, date, text), public.lic_documento_cancelar(uuid, text)
  to authenticated;
grant execute on function public.lic_assinatura_abrir(text), public.lic_assinatura_aceitar(text, text, text, boolean) to anon, authenticated;
