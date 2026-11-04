-- =====================================================================================================
--  052 · Ajustes finais de 04/11/2026: NFS-e automática e dados do escritório no papel timbrado
--
--   1  NFS-e no modo automático (a 046 deixou 'automatico' funcionando como 'conferir'): todo dia às 06h45 (depois da
--      rotina dos contratos, 06h30) o pg_cron chama a Função Edge nfse-automatica com um token interno do Vault (mesmo
--      padrão da fiscal-captura). A Função pede ao banco as faturas da empresa da gestão com modo automático, documento
--      NFS-e, não canceladas e ainda sem nota (nfse_auto_pendentes), e emite cada uma pelo mesmo caminho da tela
--      (nfse_reservar → DPS assinada → nfse_registrar_resultado; nunca repete o nDPS). Uma tentativa por fatura por dia
--      (nfse_auto_tentativas); fatura recusada pelo Emissor fica para alguém corrigir e emitir pela tela; resultado
--      incerto tenta de novo no dia seguinte (a reserva confere no Emissor antes de reenviar). Pendência, recusa ou
--      falha vão para o sino de quem gere Contratos (e administradores). Ligar o automático pede confirmação.
--   2  Papel timbrado (D-11): telefone, site, e-mail, Instagram e responsável técnico (nome e CRC) do escritório ficam
--      em org_papel_timbrado, editável pelo administrador em Configurações › Organização e painel; a Função Edge
--      demonstrativo-pdf lê de lá (o que faltar fica com o padrão da MDC). A MDC já nasce com os dados de hoje.
--
--  Testes: supabase/testes/111_base_052.sql e 112_ajustes_052.sql.
-- =====================================================================================================

-- ===================================================================================================== 1 NFS-e automática
comment on column public.nfse_parametros.modo is
  'conferir = alguém confere e clica Emitir (padrão); automatico = a nota sai sozinha às 06h45 do dia em que a fatura nasce (052).';

create table if not exists public.nfse_auto_tentativas (
  fatura_id uuid not null references public.fin_faturas(id) on delete restrict,
  dia date not null,
  org_id uuid not null references public.organizacoes(id) on delete cascade,
  cliente_id uuid not null references public.clientes(id) on delete restrict,
  ambiente text not null check (ambiente in ('producao_restrita', 'producao')),
  resultado text not null check (resultado in ('emitida', 'rejeitada', 'erro', 'pendencia')),
  mensagem text,
  criado_em timestamptz not null default now(),
  primary key (fatura_id, dia),
  check (resultado = 'emitida' or mensagem is not null)
);
comment on table public.nfse_auto_tentativas is
  'Emissão automática da NFS-e (052): uma tentativa por fatura por dia, com o resultado. Grava só a Função Edge nfse-automatica; nada se apaga.';
alter table public.nfse_auto_tentativas enable row level security;
drop policy if exists contratos_ver on public.nfse_auto_tentativas;
create policy contratos_ver on public.nfse_auto_tentativas for select to authenticated using (app.contratos_pode(cliente_id, 'ver'));
revoke all on public.nfse_auto_tentativas from anon;
revoke insert, update, delete, truncate on public.nfse_auto_tentativas from authenticated;
grant select on public.nfse_auto_tentativas to authenticated;
drop trigger if exists cliente_mesma_org on public.nfse_auto_tentativas;
create trigger cliente_mesma_org before insert or update of cliente_id, org_id on public.nfse_auto_tentativas
  for each row execute function app.tg_cliente_mesma_org();
drop trigger if exists nada_se_apaga on public.nfse_auto_tentativas;
create trigger nada_se_apaga before delete on public.nfse_auto_tentativas
  for each row execute function app.tg_nada_se_apaga('o histórico da emissão automática é permanente');

-- token do agendador (gerado pelo banco, guardado no Vault; a Função confere pelo banco, como a fiscal-captura)
do $$ begin
  if not exists (select 1 from vault.secrets where name = 'nfse_automatica_token') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'nfse_automatica_token',
      'Token interno gerado pelo banco: o pg_cron usa para chamar a Função Edge nfse-automatica.');
  end if;
end $$;
create or replace function public.nfse_token_confere(p_token text)
returns boolean language sql stable security definer set search_path = public as $$
  select p_token is not null and length(p_token) = 64
     and exists (select 1 from vault.decrypted_secrets where name = 'nfse_automatica_token' and decrypted_secret = p_token)
$$;

/** Faturas para a emissão automática de hoje: modo automático, NFS-e, empresa da gestão, ainda sem nota e sem tentativa hoje. */
create or replace function public.nfse_auto_pendentes()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('fatura', x.id, 'numero', x.numero, 'org', x.org_id, 'cliente', x.cliente_id,
                                               'ambiente', x.ambiente) order by x.emissao, x.numero), '[]')
    from (select f.id, f.numero, f.org_id, f.cliente_id, f.emissao, p.ambiente
            from fin_faturas f
            join nfse_parametros p on p.cliente_id = f.cliente_id and p.modo = 'automatico'
           where f.documento = 'nfse' and f.situacao <> 'cancelada' and f.nfse_situacao in ('a_emitir', 'erro')
             and f.emissao <= app.hoje(f.org_id)
             and app.empresa_gestao(f.cliente_id)
             and not exists (select 1 from nfse_auto_tentativas t where t.fatura_id = f.id and t.dia = app.hoje(f.org_id))
             -- já tem nota neste ambiente (no teste a fatura não muda), ou foi recusada: fica para a tela
             and not exists (select 1 from nfse_emissoes e where e.fatura_id = f.id and e.ambiente = p.ambiente
                                and e.situacao in ('emitida', 'rejeitada')
                                and e.criado_em = (select max(e2.criado_em) from nfse_emissoes e2
                                                    where e2.fatura_id = f.id and e2.ambiente = p.ambiente))
           order by f.emissao, f.numero
           limit 50) x
$$;

/** Guarda a tentativa automática de hoje e avisa no sino quando não saiu a nota. */
create or replace function public.nfse_auto_registrar(p_fatura uuid, p_resultado text, p_mensagem text default null)
returns text language plpgsql security definer set search_path = public as $$
declare f fin_faturas; v_amb text; v_hoje date; u record; v_msg text := nullif(trim(coalesce(p_mensagem, '')), '');
begin
  select * into f from fin_faturas where id = p_fatura;
  if f.id is null then raise exception 'Fatura não encontrada'; end if;
  if p_resultado is null or p_resultado not in ('emitida', 'rejeitada', 'erro', 'pendencia') then
    raise exception 'Resultado da emissão automática inválido';
  end if;
  if p_resultado <> 'emitida' and v_msg is null then raise exception 'Informe o motivo de a nota não ter saído'; end if;
  select ambiente into v_amb from nfse_parametros where cliente_id = f.cliente_id;
  v_hoje := app.hoje(f.org_id);
  insert into nfse_auto_tentativas (fatura_id, dia, org_id, cliente_id, ambiente, resultado, mensagem)
  values (f.id, v_hoje, f.org_id, f.cliente_id, coalesce(v_amb, 'producao_restrita'), p_resultado, left(v_msg, 1000))
  on conflict (fatura_id, dia) do nothing;
  if not found then return 'repetido'; end if;
  if p_resultado <> 'emitida' then
    for u in select m.user_id from membros m
              where m.org_id = f.org_id and m.ativo
                and (m.papel::text = 'admin' or exists (select 1 from hub_acessos a where a.org_id = f.org_id and a.user_id = m.user_id
                       and a.app = 'contratos' and a.papel = 'gerir' and (a.expira_em is null or a.expira_em >= v_hoje)))
    loop
      perform app.notificar(f.org_id, u.user_id, 'contratos', 'Contratos: nota fiscal automática não saiu',
        format('Fatura %s: %s Abra a fatura e emita pela tela.', f.numero,
               case p_resultado when 'pendencia' then 'falta ajustar antes de emitir: ' || v_msg
                                when 'rejeitada' then 'o Emissor Nacional recusou: ' || v_msg
                                else 'sem resposta certa do Emissor Nacional (o HUB tenta de novo amanhã): ' || v_msg end),
        '/contratos/faturas');
    end loop;
  end if;
  perform app.registrar(f.org_id, 'contratos', 'nfse_automatica', f.id::text, null,
    jsonb_build_object('fatura', f.numero, 'resultado', p_resultado, 'mensagem', v_msg, 'dia', v_hoje));
  return p_resultado;
end $$;

do $$
declare f text;
begin
  foreach f in array array['nfse_token_confere(text)', 'nfse_auto_pendentes()', 'nfse_auto_registrar(uuid, text, text)'] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    if exists (select 1 from pg_roles where rolname = 'service_role') then
      execute format('grant execute on function public.%s to service_role', f);
    end if;
  end loop;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant select on public.nfse_auto_tentativas to service_role';
  end if;
end $$;
comment on function public.nfse_token_confere(text) is 'Só a Função Edge nfse-automatica (service_role): confere o token do agendador (052).';
comment on function public.nfse_auto_pendentes() is 'Só a Função Edge nfse-automatica (service_role): faturas para emitir hoje no modo automático (052).';
comment on function public.nfse_auto_registrar(uuid, text, text) is
  'Só a Função Edge nfse-automatica (service_role): uma tentativa por fatura por dia; falha avisa quem gere Contratos (052).';

-- ligar o automático pede confirmação (mesma regra da 046, com essa trava a mais)
create or replace function public.nfse_parametros_salvar(p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_cliente uuid := app.uuid_campo(p->>'cliente', 'empresa'); v_org uuid; a nfse_parametros; n nfse_parametros;
  v_amb text; v_modo text; v_serie text; v_op text; v_reg text; v_esp text; v_im text; v_mun text; v_nbs text; v_ptot numeric;
  v_prox bigint := app.numero_campo(p->>'proximo_ndps', 'próximo número da DPS')::bigint; v_usado bigint;
begin
  select org_id into v_org from clientes where id = v_cliente;
  if v_org is null then raise exception 'Empresa não encontrada'; end if;
  if not app.contratos_pode(v_cliente, 'gerir') then
    raise exception 'Sem permissão para mudar a emissão da nota fiscal (módulo Contratos, nível gerir)';
  end if;
  select * into a from nfse_parametros where cliente_id = v_cliente for update;
  v_amb := case when p ? 'ambiente' then nullif(p->>'ambiente', '') else coalesce(a.ambiente, 'producao_restrita') end;
  v_modo := case when p ? 'modo' then nullif(p->>'modo', '') else coalesce(a.modo, 'conferir') end;
  v_serie := case when p ? 'serie' then ltrim(trim(coalesce(p->>'serie', '')), '0') else coalesce(a.serie, '1') end;
  v_op := case when p ? 'op_simples' then nullif(p->>'op_simples', '') else coalesce(a.op_simples, '3') end;
  v_reg := case when p ? 'reg_ap_trib_sn' then nullif(p->>'reg_ap_trib_sn', '') else coalesce(a.reg_ap_trib_sn, '1') end;
  v_esp := case when p ? 'reg_esp_trib' then nullif(p->>'reg_esp_trib', '') else coalesce(a.reg_esp_trib, '0') end;
  v_im := case when p ? 'inscricao_municipal' then nullif(trim(p->>'inscricao_municipal'), '') else a.inscricao_municipal end;
  v_mun := case when p ? 'codigo_municipio' then app.fin_digitos(p->>'codigo_municipio') else coalesce(a.codigo_municipio, '3507605') end;
  v_nbs := case when p ? 'nbs_padrao' then app.fin_digitos(p->>'nbs_padrao') else a.nbs_padrao end;
  v_ptot := case when p ? 'p_tot_trib_sn' then app.numero_campo(p->>'p_tot_trib_sn', 'percentual dos tributos') else a.p_tot_trib_sn end;
  if v_amb is null or v_amb not in ('producao_restrita', 'producao') then raise exception 'Ambiente: teste (produção restrita) ou produção'; end if;
  if v_amb = 'producao' and a.ambiente is distinct from 'producao' and coalesce((p->>'confirmo_producao')::boolean, false) is not true then
    raise exception 'Para emitir notas de verdade (produção), confirme que os testes no ambiente de teste deram certo';
  end if;
  if v_modo is null or v_modo not in ('conferir', 'automatico') then raise exception 'Modo: conferir antes de emitir ou automático'; end if;
  if v_modo = 'automatico' and a.modo is distinct from 'automatico' and coalesce((p->>'confirmo_automatico')::boolean, false) is not true then
    raise exception 'Para ligar a emissão automática, confirme que a nota pode sair sem ninguém conferir antes';
  end if;
  if v_serie is null or v_serie !~ '^[1-9][0-9]{0,4}$' or v_serie::int > 49999 then
    raise exception 'Série da DPS: de 1 a 49999 (faixa de sistema próprio do Emissor Nacional)';
  end if;
  if v_op is distinct from '3' then raise exception 'Por enquanto o HUB emite nota só para empresa ME/EPP do Simples Nacional (opção 3)'; end if;
  v_reg := coalesce(v_reg, '1');
  if v_reg not in ('1', '2', '3') then raise exception 'Regime de apuração do Simples: 1, 2 ou 3'; end if;
  v_esp := coalesce(v_esp, '0');
  if v_esp not in ('0', '1', '2', '3', '4', '5', '6') then raise exception 'Regime especial de tributação inválido'; end if;
  if v_reg = '1' and v_esp <> '0' then raise exception 'Com o ISS apurado pelo Simples, o regime especial precisa ser "Nenhum"'; end if;
  if v_im is not null and v_im !~ '^[0-9A-Za-z./-]{1,15}$' then raise exception 'Inscrição municipal: até 15 letras ou números'; end if;
  if v_mun is null or length(v_mun) <> 7 then raise exception 'Código do município: os 7 números do IBGE (Bragança Paulista = 3507605)'; end if;
  if v_nbs is not null and length(v_nbs) <> 9 then raise exception 'Código NBS: 9 números (ex.: 1.1302.10.00 → 113021000)'; end if;
  if v_ptot is not null and (v_ptot < 0 or v_ptot >= 100) then raise exception 'Percentual dos tributos do Simples: de 0 a 99,99'; end if;

  insert into nfse_parametros as t (cliente_id, org_id, ambiente, modo, serie, op_simples, reg_ap_trib_sn, reg_esp_trib, inscricao_municipal,
                                    codigo_municipio, nbs_padrao, p_tot_trib_sn, atualizado_em, atualizado_por)
  values (v_cliente, v_org, v_amb, v_modo, v_serie, v_op, v_reg, v_esp, v_im, v_mun, v_nbs, round(v_ptot, 2), now(), auth.uid())
  on conflict (cliente_id) do update
     set ambiente = excluded.ambiente, modo = excluded.modo, serie = excluded.serie, op_simples = excluded.op_simples,
         reg_ap_trib_sn = excluded.reg_ap_trib_sn, reg_esp_trib = excluded.reg_esp_trib, inscricao_municipal = excluded.inscricao_municipal,
         codigo_municipio = excluded.codigo_municipio, nbs_padrao = excluded.nbs_padrao, p_tot_trib_sn = excluded.p_tot_trib_sn,
         atualizado_em = now(), atualizado_por = auth.uid()
  returning * into n;

  if v_prox is not null then
    select max(ndps) into v_usado from nfse_emissoes where cliente_id = v_cliente and ambiente = v_amb and serie = v_serie;
    if v_prox < 1 or v_prox > 999999999999999 then raise exception 'Próximo número da DPS: de 1 a 999999999999999'; end if;
    if v_usado is not null and v_prox <= v_usado then
      raise exception 'O próximo número da DPS precisa ser maior que %, o último já usado nesta série', v_usado;
    end if;
    insert into nfse_numeracao (cliente_id, org_id, ambiente, serie, proximo) values (v_cliente, v_org, v_amb, v_serie, v_prox)
    on conflict (cliente_id, ambiente, serie) do update set proximo = excluded.proximo, atualizado_em = now();
  end if;
  perform app.registrar(v_org, 'contratos', 'nfse_parametros', v_cliente::text, to_jsonb(a),
    to_jsonb(n) || jsonb_build_object('proximo_ndps', v_prox));
  return to_jsonb(n) || jsonb_build_object('proximo_ndps',
    (select proximo from nfse_numeracao where cliente_id = v_cliente and ambiente = n.ambiente and serie = n.serie));
end $$;
comment on function public.nfse_parametros_salvar(jsonb) is
  'Parâmetros da emissão da NFS-e (Contratos: gerir); produção e modo automático pedem confirmação; próximo nDPS nunca abaixo de um já usado (046/052).';
revoke all on function public.nfse_parametros_salvar(jsonb) from public, anon;
grant execute on function public.nfse_parametros_salvar(jsonb) to authenticated;

-- agendamento: 06h45 de Brasília, só quando alguma empresa está no automático
do $$ begin
  if exists (select 1 from pg_namespace where nspname = 'cron') then
    if exists (select 1 from cron.job where jobname = 'nfse-automatica') then perform cron.unschedule('nfse-automatica'); end if;
    perform cron.schedule('nfse-automatica', '45 9 * * *', $cron$
      select net.http_post(
        url := 'https://bulqqdgfrrpqquqvjjfa.supabase.co/functions/v1/nfse-automatica',
        headers := jsonb_build_object('Content-Type', 'application/json',
          'x-agente-token', (select decrypted_secret from vault.decrypted_secrets where name = 'nfse_automatica_token')),
        body := '{"acao":"rodar"}'::jsonb,
        timeout_milliseconds := 140000)
      where exists (select 1 from public.nfse_parametros where modo = 'automatico')
    $cron$);
  end if;
end $$;

-- ===================================================================================================== 2 papel timbrado
create table if not exists public.org_papel_timbrado (
  org_id uuid primary key references public.organizacoes(id) on delete cascade,
  telefone text check (telefone is null or length(telefone) <= 30),
  site text check (site is null or length(site) <= 80),
  email text check (email is null or email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  instagram text check (instagram is null or length(instagram) <= 40),
  responsavel text check (responsavel is null or length(responsavel) <= 120),
  crc text check (crc is null or length(crc) <= 30),
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid
);
comment on table public.org_papel_timbrado is
  'Contatos e responsável técnico do escritório no papel timbrado dos documentos (Demonstrativo). Grava só org_papel_timbrado_salvar (administrador) (052).';
alter table public.org_papel_timbrado enable row level security;
drop policy if exists papel_timbrado_ver on public.org_papel_timbrado;
create policy papel_timbrado_ver on public.org_papel_timbrado for select to authenticated
  using (org_id in (select app.minhas_orgs()));
revoke all on public.org_papel_timbrado from anon;
revoke insert, update, delete, truncate on public.org_papel_timbrado from authenticated;
grant select on public.org_papel_timbrado to authenticated;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant select on public.org_papel_timbrado to service_role';
  end if;
end $$;

create or replace function public.org_papel_timbrado_salvar(p_org uuid, p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare a org_papel_timbrado; n org_papel_timbrado; v_email text := nullif(lower(trim(coalesce(p->>'email', ''))), '');
begin
  if p_org is null or not exists (select 1 from organizacoes where id = p_org) then raise exception 'Organização não encontrada'; end if;
  if app.papel(p_org) is distinct from 'admin' then raise exception 'Só o administrador muda os dados do papel timbrado'; end if;
  if v_email is not null and v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'E-mail do papel timbrado inválido'; end if;
  select * into a from org_papel_timbrado where org_id = p_org for update;
  insert into org_papel_timbrado (org_id, telefone, site, email, instagram, responsavel, crc, atualizado_em, atualizado_por)
  values (p_org, nullif(trim(coalesce(p->>'telefone', '')), ''), nullif(trim(coalesce(p->>'site', '')), ''), v_email,
          nullif(trim(coalesce(p->>'instagram', '')), ''), nullif(trim(coalesce(p->>'responsavel', '')), ''),
          nullif(upper(trim(coalesce(p->>'crc', ''))), ''), now(), auth.uid())
  on conflict (org_id) do update
     set telefone = excluded.telefone, site = excluded.site, email = excluded.email, instagram = excluded.instagram,
         responsavel = excluded.responsavel, crc = excluded.crc, atualizado_em = now(), atualizado_por = auth.uid()
  returning * into n;
  perform app.registrar(p_org, 'organizacao', 'papel_timbrado', p_org::text, to_jsonb(a), to_jsonb(n));
  return to_jsonb(n);
end $$;
revoke all on function public.org_papel_timbrado_salvar(uuid, jsonb) from public, anon;
grant execute on function public.org_papel_timbrado_salvar(uuid, jsonb) to authenticated;
comment on function public.org_papel_timbrado_salvar(uuid, jsonb) is
  'Contatos e responsável técnico do papel timbrado (só administrador, auditado) (052).';

-- a MDC já nasce com os dados de hoje (os mesmos que estavam fixos no PDF do Demonstrativo)
insert into public.org_papel_timbrado (org_id, telefone, site, email, instagram, responsavel, crc)
select o.id, '(11) 98859-8041', 'mdcassessoria.com', 'edvaldo@mdcassessoria.com', '@mdcassessoria_',
       'Edvaldo Ribeiro de Carvalho', '1SP346098-O/0'
  from public.organizacoes o join public.clientes c on c.id = o.gestao_cliente_id
 where regexp_replace(coalesce(c.cnpj, ''), '\D', '', 'g') = '48140121000165'
on conflict (org_id) do nothing;
