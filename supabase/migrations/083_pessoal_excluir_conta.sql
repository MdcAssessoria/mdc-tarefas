-- 083 MDC · Pessoal: "Excluir minha conta" (exigência da Google Play e direito do titular pela LGPD, art. 18).
--   A pessoa apaga a própria conta pelo app ou pela página pública /pessoal/excluir-conta. Este passo, no banco:
--     - família em que ela é a única pessoa: a família inteira é apagada (finanças, tarefas, convites, avisos);
--     - família com mais gente: ela sai; se era a única responsável, a pessoa mais antiga vira responsável; as tarefas
--       abertas dela ficam sem responsável (como em pessoal_remover);
--     - autorização de contato da MDC ("Você tem empresa?") é retirada e o lead é arquivado.
--   Depois a Função Edge pessoal-excluir-conta apaga o login (auth.users), o que leva junto inscrições de aviso e
--   o resto ligado ao usuário (on delete cascade / set null).
--   Quem também usa o HUB da MDC ou o Portal do Cliente não exclui por aqui: a conta é da empresa (pede ao administrador).
--   Fica registrado só o fato (quando, quantas famílias apagadas e de quantas saiu), sem nome nem e-mail.
-- O código é do Edvaldo Ribeiro de Carvalho (MDC Assessoria Contábil).

create table if not exists app.pessoal_exclusoes (
  id bigint generated always as identity primary key,
  em timestamptz not null default now(),
  familias_apagadas int not null,
  familias_que_saiu int not null
);
alter table app.pessoal_exclusoes enable row level security;
revoke all on app.pessoal_exclusoes from public, anon, authenticated;
comment on table app.pessoal_exclusoes is 'Contas do MDC · Pessoal excluídas pela própria pessoa (só o fato, sem dado pessoal; 083).';

-- as travas de membro não valem quando a própria família está sendo apagada (o banco marca app.pode_apagar)
create or replace function app.tg_membro_ultimo_admin()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' and coalesce(current_setting('app.pode_apagar', true), '') = '1' then return old; end if;
  if old.papel = 'admin' and old.ativo
     and (tg_op = 'DELETE' or new.papel <> 'admin' or not new.ativo)
     and (select count(*) from public.membros
          where org_id = old.org_id and papel = 'admin' and ativo and user_id <> old.user_id) = 0 then
    raise exception 'A organização precisa de pelo menos um administrador ativo';
  end if;
  return coalesce(new, old);
end $$;

create or replace function app.tg_membro_sem_pendencias()
returns trigger language plpgsql security definer set search_path = public as $$
declare p jsonb; total int;
begin
  if tg_op = 'DELETE' and coalesce(current_setting('app.pode_apagar', true), '') = '1' then return old; end if;
  if tg_op = 'UPDATE' and not (old.ativo and not new.ativo) then return new; end if;
  p := app.pendencias_membro(old.org_id, old.user_id);
  select coalesce(sum(value::int), 0) into total from jsonb_each_text(p);
  if total > 0 then
    raise exception 'Transfira o trabalho em aberto de % antes de inativar (tarefas: %, carteira de clientes: %, processos: %, atendimentos: %, vencimentos: %, oportunidades: %)',
      old.nome, p ->> 'tarefas', p ->> 'carteira', (p ->> 'processos')::int + (p ->> 'fases')::int, p ->> 'atendimentos', p ->> 'vencimentos', p ->> 'oportunidades';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;

/** Primeiro passo de "Excluir minha conta": apaga ou deixa as famílias da pessoa. Pede a palavra EXCLUIR. */
create or replace function public.pessoal_excluir_conta_preparar(p_confirmacao text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  r record;
  v_apagadas int := 0;
  v_saiu int := 0;
  v_novo uuid;
begin
  if v_user is null then raise exception 'Entre na sua conta para excluir'; end if;
  if upper(trim(coalesce(p_confirmacao, ''))) <> 'EXCLUIR' then
    raise exception 'Para confirmar, escreva EXCLUIR';
  end if;
  if exists (select 1 from membros m join organizacoes o on o.id = m.org_id
              where m.user_id = v_user and m.ativo and o.tipo is distinct from 'pessoal')
     or exists (select 1 from portal_usuarios p where p.user_id = v_user and p.ativo) then
    raise exception 'Esta conta também é usada no HUB ou no Portal da MDC. Para excluir, fale com a MDC.';
  end if;
  perform pg_advisory_xact_lock(hashtext('pessoal_excluir_conta:' || v_user::text));

  -- autorização de contato da MDC: retira e arquiva o lead (mesma regra de pessoal_retirar_contato)
  for r in select c.id from pessoal_contatos_empresa c where c.user_id = v_user and c.retirado_em is null loop
    perform public.pessoal_retirar_contato(r.id);
  end loop;

  for r in
    select m.org_id from membros m join organizacoes o on o.id = m.org_id
     where m.user_id = v_user and o.tipo = 'pessoal'
  loop
    if not exists (select 1 from membros x where x.org_id = r.org_id and x.user_id <> v_user and x.ativo) then
      -- só ela na família: apaga a família inteira (tudo que é da família cai junto, por on delete cascade)
      perform set_config('app.pode_apagar', '1', true);
      delete from organizacoes where id = r.org_id;
      perform set_config('app.pode_apagar', '', true);
      v_apagadas := v_apagadas + 1;
    else
      perform 1 from membros where org_id = r.org_id and ativo for update;
      -- era a única responsável: a pessoa mais antiga da família passa a ser
      if exists (select 1 from membros where org_id = r.org_id and user_id = v_user and ativo and papel = 'admin')
         and not exists (select 1 from membros where org_id = r.org_id and user_id <> v_user and ativo and papel = 'admin') then
        select user_id into v_novo from membros
         where org_id = r.org_id and user_id <> v_user and ativo order by criado_em, user_id limit 1;
        update membros set papel = 'admin' where org_id = r.org_id and user_id = v_novo;
        update hub_acessos set papel = 'gerir' where org_id = r.org_id and user_id = v_novo;
      end if;
      update tarefas set responsavel_id = null
       where org_id = r.org_id and responsavel_id = v_user and status in ('a_fazer', 'em_andamento', 'aguardando');
      delete from hub_acessos where org_id = r.org_id and user_id = v_user;
      perform set_config('app.pode_apagar', '1', true);
      delete from membros where org_id = r.org_id and user_id = v_user;
      perform set_config('app.pode_apagar', '', true);
      perform app.registrar(r.org_id, 'pessoal', 'conta_excluida', null, null, jsonb_build_object('saiu', true));
      v_saiu := v_saiu + 1;
    end if;
  end loop;

  insert into app.pessoal_exclusoes (familias_apagadas, familias_que_saiu) values (v_apagadas, v_saiu);
  return jsonb_build_object('familias_apagadas', v_apagadas, 'familias_que_saiu', v_saiu);
end $$;
revoke all on function public.pessoal_excluir_conta_preparar(text) from public, anon;
grant execute on function public.pessoal_excluir_conta_preparar(text) to authenticated;
comment on function public.pessoal_excluir_conta_preparar(text) is
  'MDC · Pessoal, Excluir minha conta: apaga as famílias em que a pessoa está sozinha e a tira das outras (083). O login é apagado depois pela Função Edge pessoal-excluir-conta.';
