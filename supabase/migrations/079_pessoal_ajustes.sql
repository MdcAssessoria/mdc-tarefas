-- 079 MDC · Pessoal: médios da auditoria de 14/11/2026 que pedem banco (docs/auditoria/2026-11-14-parecer.md).
--   COD-15: o aviso no celular abre a família certa (link com ?org=<slug>) e diz de qual família é (nome no título).
--   COD-20: membros da família só mudam pelas funções (insert/update/delete direto pela API barrado em família);
--           o único responsável não sai nem é tirado (a família não fica sem responsável); qualquer responsável
--           retira a autorização de contato da família (antes só quem autorizou, e o botão aparecia para todos).
--   COD-22: além do limite por endereço de rede (que um cabeçalho forjado pode driblar), um teto geral de 60 contas
--           novas por hora no cadastro aberto.
-- O código é do Edvaldo Ribeiro de Carvalho (MDC Assessoria Contábil).

-- ================================================================================ COD-20 membros só por função
drop policy if exists membros_pessoal_insert on public.membros;
create policy membros_pessoal_insert on public.membros as restrictive for insert to authenticated
  with check (not app.org_pessoal(org_id));
drop policy if exists membros_pessoal_update on public.membros;
create policy membros_pessoal_update on public.membros as restrictive for update to authenticated
  using (not app.org_pessoal(org_id)) with check (not app.org_pessoal(org_id));
drop policy if exists membros_pessoal_delete on public.membros;
create policy membros_pessoal_delete on public.membros as restrictive for delete to authenticated
  using (not app.org_pessoal(org_id));

/* Sair ou ser tirado da família: nunca deixa a família sem responsável; tarefas abertas ficam sem dono (078). */
create or replace function public.pessoal_remover(p_org uuid, p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not app.org_pessoal(p_org) then raise exception 'Família não encontrada'; end if;
  if p_user is distinct from auth.uid() and app.papel(p_org) is distinct from 'admin' then
    raise exception 'Só o responsável pela família tira pessoas';
  end if;
  perform 1 from membros where org_id = p_org and ativo for update;
  if exists (select 1 from membros where org_id = p_org and user_id = p_user and ativo and papel = 'admin')
     and (select count(*) from membros where org_id = p_org and ativo and papel = 'admin') <= 1 then
    raise exception 'A família precisa de um responsável. Antes de sair, dê a permissão de responsável a outra pessoa';
  end if;
  update tarefas set responsavel_id = null
   where org_id = p_org and responsavel_id = p_user and status in ('a_fazer', 'em_andamento', 'aguardando');
  update membros set ativo = false where org_id = p_org and user_id = p_user and ativo;
  if not found then raise exception 'Pessoa não encontrada na família'; end if;
  delete from hub_acessos where org_id = p_org and user_id = p_user;
  perform app.registrar(p_org, 'pessoal', 'remover', p_user::text, null, null);
end $$;

/* Retirar a autorização de contato: quem autorizou ou qualquer responsável ativo da família. */
create or replace function public.pessoal_retirar_contato(p_contato uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare c public.pessoal_contatos_empresa;
begin
  select * into c from public.pessoal_contatos_empresa x
   where x.id = p_contato
     and (x.user_id = auth.uid()
          or exists (select 1 from public.membros m where m.org_id = x.org_id and m.user_id = auth.uid()
                      and m.ativo and m.papel::text = 'admin'))
   for update;
  if c.id is null then raise exception 'Autorização não encontrada'; end if;
  if c.retirado_em is not null then return; end if;
  update public.pessoal_contatos_empresa set retirado_em = now() where id = c.id;
  if c.oportunidade_id is not null then
    insert into public.crm_atividades (org_id, oportunidade_id, tipo, texto)
    select o.org_id, o.id, 'nota', c.nome || ' retirou a autorização de contato dada pelo MDC · Pessoal. Não entre mais em contato por este canal.'
      from public.crm_oportunidades o where o.id = c.oportunidade_id;
    update public.crm_oportunidades
       set arquivado_em = now(), motivo_arquivo = 'A pessoa retirou a autorização de contato (MDC · Pessoal)'
     where id = c.oportunidade_id and origem = 'pessoal' and origem_ref = c.id::text
       and arquivado_em is null and etapa <> 'ganho';
  end if;
  perform app.registrar(c.org_id, 'pessoal', 'contato_retirar', c.cnpj, null, null);
end $$;

-- ===================================================================== COD-15 aviso abre a família certa
create or replace function app.pessoal_resumo_rodar(p_agora timestamptz default now())
returns int language plpgsql security definer set search_path = '' as $$
declare
  r record;
  v_hoje date;
  v_hora int;
  v_res jsonb;
  v_titulo text;
  n int := 0;
begin
  for r in
    select o.id as org_id, o.nome as familia, o.slug, coalesce(o.fuso, 'America/Sao_Paulo') as fuso, m.user_id,
           coalesce(p.ligado, true) as ligado, coalesce(p.hora, 7) as hora, coalesce(p.celular, true) as celular, p.ultimo_dia
      from public.organizacoes o
      join public.membros m on m.org_id = o.id and m.ativo
      left join public.pessoal_resumo_preferencias p on p.org_id = o.id and p.user_id = m.user_id
     where o.tipo = 'pessoal' and o.ativo
       and (m.papel = 'admin' or exists (select 1 from public.hub_acessos a
                                          where a.org_id = o.id and a.user_id = m.user_id and a.app = 'financeiro'))
  loop
    begin
      v_hoje := (p_agora at time zone r.fuso)::date;
      v_hora := extract(hour from (p_agora at time zone r.fuso))::int;
      continue when not r.ligado or v_hora < r.hora or r.ultimo_dia is not distinct from v_hoje;

      v_res := app.pessoal_resumo_texto(r.org_id, v_hoje);
      insert into public.pessoal_resumo_preferencias (org_id, user_id, ultimo_dia)
      values (r.org_id, r.user_id, v_hoje)
      on conflict (org_id, user_id) do update set ultimo_dia = excluded.ultimo_dia;
      continue when not coalesce((v_res ->> 'tem')::boolean, false);

      insert into public.hub_notificacoes (org_id, user_id, app, titulo, texto, link)
      values (r.org_id, r.user_id, 'financeiro', v_res ->> 'titulo', v_res ->> 'texto', '/');
      if r.celular and exists (select 1 from public.pessoal_push_inscricoes i where i.user_id = r.user_id) then
        -- no celular: diz de qual família é e abre direto nela
        v_titulo := left(r.familia, 40) || ' · ' || (v_res ->> 'titulo');
        insert into app.pessoal_push_fila (user_id, titulo, texto, link)
        values (r.user_id, v_titulo, v_res ->> 'texto', '/?org=' || r.slug);
      end if;
      n := n + 1;
    exception when others then
      raise warning 'pessoal_resumo_rodar: família % ficou sem resumo: %', r.org_id, sqlerrm;
    end;
  end loop;
  delete from app.pessoal_push_fila where criado_em < p_agora - interval '2 days';
  return n;
end $$;

-- =============================================================== COD-22 teto geral do cadastro aberto
create or replace function public.pessoal_cadastro_tentativa(p_ip_hash text)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_n int;
begin
  if p_ip_hash is null or length(p_ip_hash) < 16 then raise exception 'Pedido inválido'; end if;
  perform pg_advisory_xact_lock(hashtext('pessoal_cadastro_tentativa'));
  delete from app.pessoal_cadastros where criado_em < now() - interval '1 day';
  -- teto geral: segura robô que troca o endereço de rede a cada pedido
  if (select count(*) from app.pessoal_cadastros where criado_em > now() - interval '1 hour') >= 60 then return false; end if;
  select count(*) into v_n from app.pessoal_cadastros where ip_hash = p_ip_hash and criado_em > now() - interval '1 hour';
  if v_n >= 5 then return false; end if;
  insert into app.pessoal_cadastros (ip_hash) values (p_ip_hash);
  return true;
end $$;

comment on function public.pessoal_cadastro_tentativa(text) is 'MDC · Pessoal: limite do cadastro aberto (5 por hora por endereço e 60 por hora no total, 079); só a Função pessoal-cadastro chama.';
comment on function public.pessoal_remover(uuid, uuid) is 'MDC · Pessoal: sair ou tirar alguém da família; o único responsável não sai (079).';
comment on function public.pessoal_retirar_contato(uuid) is 'MDC · Pessoal: retira a autorização de contato (quem autorizou ou um responsável) e arquiva o lead que veio dela.';
