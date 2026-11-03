-- 043 — Cobrança Ledgra emitida pelo Ledgra Link (boleto híbrido ou Pix) com baixa automática.
--
-- O Ledgra Link by MDC Assessoria é o add-on de conexão bancária da MDC (repositório ledgra-link). Ele fala com os
-- bancos e guarda os certificados; o HUB só pede "emita esta mensalidade" e recebe o aviso "foi paga".
--
--   link_config     configuração por organização (ligado, conta da MDC no Ledgra Link, boleto ou Pix, multa e juros)
--   link_cobrancas  mensalidade × cobrança no Ledgra Link (linha digitável, Pix copia e cola, situação)
--   link_eventos    cada aviso recebido do Ledgra Link, uma vez só (o id do evento é a chave)
--
-- Quem grava:
--   link_salvar_config      tela (administrador ou Licenças › gerir)
--   link_pode_emitir        a Função Edge ledgra-link confere, com o login de quem pediu, antes de chamar o Ledgra Link
--   link_registrar_emissao  só a Função Edge (service_role), depois que o Ledgra Link respondeu
--   link_aplicar_evento     só a Função Edge ledgra-link-webhook (service_role), com o aviso já conferido pela assinatura
-- Baixa automática: entra em lic_baixas como uma baixa comum (sem usuário, forma "Pix/Boleto (Ledgra Link)"), então
-- desfazer, relatórios e inadimplência funcionam igual. A trava lic_baixas_uma_valida impede baixa em dobro.

create table if not exists public.link_config (
  org_id uuid primary key references public.organizacoes(id) on delete cascade,
  ativo boolean not null default false,
  conta_link_id uuid,
  tipo_padrao text not null default 'boleto_hibrido' check (tipo_padrao in ('boleto_hibrido', 'pix_vencimento', 'boleto')),
  multa_percentual numeric(5, 2) not null default 2 check (multa_percentual between 0 and 2),
  juros_mensal_percentual numeric(5, 2) not null default 1 check (juros_mensal_percentual between 0 and 10),
  dias_apos_vencimento int not null default 30 check (dias_apos_vencimento between 0 and 120),
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid,
  check (not ativo or conta_link_id is not null)
);
comment on table public.link_config is 'Ledgra Link na Cobrança Ledgra: ligado/desligado, conta da MDC no Ledgra Link, tipo de cobrança, multa e juros.';

create table if not exists public.link_cobrancas (
  lic_cobranca_id uuid primary key references public.lic_cobrancas(id) on delete restrict,
  org_id uuid not null references public.organizacoes(id) on delete cascade,
  cobranca_link_id uuid not null unique,
  tipo text not null check (tipo in ('boleto_hibrido', 'pix_vencimento', 'boleto')),
  situacao text not null default 'registrada'
    check (situacao in ('registrada', 'paga', 'paga_parcial', 'baixada', 'cancelada', 'vencida', 'rejeitada')),
  linha_digitavel text,
  pix_copia_cola text,
  nosso_numero text,
  emitida_em timestamptz not null default now(),
  emitida_por uuid,
  atualizado_em timestamptz not null default now()
);
create index if not exists link_cobrancas_org on public.link_cobrancas (org_id);
comment on table public.link_cobrancas is 'Mensalidade × cobrança emitida pelo Ledgra Link. Só as funções link_* gravam.';

create table if not exists public.link_eventos (
  id_evento uuid primary key,
  org_id uuid references public.organizacoes(id) on delete cascade,
  tipo text not null,
  recebido_em timestamptz not null default now(),
  resultado text not null default 'recebido',
  detalhe jsonb
);
create index if not exists link_eventos_org on public.link_eventos (org_id, recebido_em desc);
comment on table public.link_eventos is 'Avisos do Ledgra Link, um por id (o mesmo aviso repetido não é aplicado de novo).';

alter table public.link_config enable row level security;
alter table public.link_cobrancas enable row level security;
alter table public.link_eventos enable row level security;

drop policy if exists link_config_ver on public.link_config;
create policy link_config_ver on public.link_config for select to authenticated using (app.hub_pode(org_id, 'licencas', 'ver'));
drop policy if exists link_cobrancas_ver on public.link_cobrancas;
create policy link_cobrancas_ver on public.link_cobrancas for select to authenticated using (app.hub_pode(org_id, 'licencas', 'ver'));
drop policy if exists link_eventos_ver on public.link_eventos;
create policy link_eventos_ver on public.link_eventos for select to authenticated using (app.hub_pode(org_id, 'licencas', 'gerir'));

revoke all on public.link_config, public.link_cobrancas, public.link_eventos from anon;
revoke insert, update, delete on public.link_config, public.link_cobrancas, public.link_eventos from authenticated;
grant select on public.link_config, public.link_cobrancas, public.link_eventos to authenticated;

-- ------------------------------------------------------------------------------------- configuração (tela)
create or replace function public.link_salvar_config(p_org uuid, p jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare v_antes jsonb; v_ativo boolean := coalesce((p ->> 'ativo')::boolean, false); v_conta uuid;
begin
  if not app.hub_pode(p_org, 'licencas', 'gerir') then raise exception 'Sem permissão para configurar o Ledgra Link'; end if;
  v_conta := nullif(trim(p ->> 'conta_link_id'), '')::uuid;
  if v_ativo and v_conta is null then raise exception 'Informe a conta da MDC no Ledgra Link antes de ligar'; end if;
  select to_jsonb(c) into v_antes from link_config c where org_id = p_org;
  insert into link_config (org_id, ativo, conta_link_id, tipo_padrao, multa_percentual, juros_mensal_percentual,
                           dias_apos_vencimento, atualizado_em, atualizado_por)
  values (p_org, v_ativo, v_conta, coalesce(p ->> 'tipo_padrao', 'boleto_hibrido'),
          coalesce((p ->> 'multa_percentual')::numeric, 2), coalesce((p ->> 'juros_mensal_percentual')::numeric, 1),
          coalesce((p ->> 'dias_apos_vencimento')::int, 30), now(), auth.uid())
  on conflict (org_id) do update set ativo = excluded.ativo, conta_link_id = excluded.conta_link_id,
    tipo_padrao = excluded.tipo_padrao, multa_percentual = excluded.multa_percentual,
    juros_mensal_percentual = excluded.juros_mensal_percentual, dias_apos_vencimento = excluded.dias_apos_vencimento,
    atualizado_em = now(), atualizado_por = auth.uid();
  perform app.registrar(p_org, 'licencas', 'ledgra_link_config', p_org::text, v_antes,
    (select to_jsonb(c) from link_config c where org_id = p_org));
exception
  when check_violation then raise exception 'Valores fora do permitido: multa até 2%%, juros até 10%% ao mês, prazo após o vencimento até 120 dias';
  when invalid_text_representation then raise exception 'Código da conta no Ledgra Link inválido';
end $$;
comment on function public.link_salvar_config(uuid, jsonb) is 'Liga/desliga e configura o Ledgra Link na Cobrança Ledgra (Licenças › gerir).';

-- ------------------------------------------------------------------------- emissão (Função Edge ledgra-link)
create or replace function public.link_pode_emitir(p_cobranca uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from lic_cobrancas c join link_config k on k.org_id = c.org_id
     where c.id = p_cobranca and c.situacao = 'aberta' and k.ativo
       and app.hub_pode(c.org_id, 'licencas', 'operar'));
$$;
comment on function public.link_pode_emitir(uuid) is
  'A Função Edge ledgra-link confere com o login de quem pediu: mensalidade em aberto, Ledgra Link ligado e permissão operar.';

create or replace function public.link_registrar_emissao(p_cobranca uuid, p_user uuid, p jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare c lic_cobrancas; v_antes jsonb;
begin
  select * into c from lic_cobrancas where id = p_cobranca for update;
  if c.id is null then raise exception 'Mensalidade não encontrada'; end if;
  if c.situacao <> 'aberta' then raise exception 'Esta mensalidade não está em aberto'; end if;
  select to_jsonb(l) into v_antes from link_cobrancas l where lic_cobranca_id = c.id;
  insert into link_cobrancas (lic_cobranca_id, org_id, cobranca_link_id, tipo, situacao, linha_digitavel, pix_copia_cola,
                              nosso_numero, emitida_em, emitida_por, atualizado_em)
  values (c.id, c.org_id, (p ->> 'cobranca_link_id')::uuid, p ->> 'tipo', 'registrada', p ->> 'linha_digitavel',
          p ->> 'pix_copia_cola', p ->> 'nosso_numero', now(), p_user, now())
  on conflict (lic_cobranca_id) do update set cobranca_link_id = excluded.cobranca_link_id, tipo = excluded.tipo,
    situacao = 'registrada', linha_digitavel = excluded.linha_digitavel, pix_copia_cola = excluded.pix_copia_cola,
    nosso_numero = excluded.nosso_numero, emitida_em = now(), emitida_por = excluded.emitida_por, atualizado_em = now()
  where link_cobrancas.situacao in ('rejeitada', 'cancelada', 'baixada', 'vencida');  -- emitida e válida não troca
  if not found and v_antes is not null then raise exception 'Esta mensalidade já tem boleto/Pix válido emitido'; end if;
  insert into hub_auditoria (org_id, user_id, app, acao, alvo, antes, depois)
  values (c.org_id, p_user, 'licencas', 'ledgra_link_emitir', c.id::text, v_antes,
          (select to_jsonb(l) from link_cobrancas l where lic_cobranca_id = c.id));
end $$;
comment on function public.link_registrar_emissao(uuid, uuid, jsonb) is
  'Só a Função Edge ledgra-link (service_role): guarda o boleto/Pix que o Ledgra Link emitiu para a mensalidade.';

-- ---------------------------------------------------------------- avisos (Função Edge ledgra-link-webhook)
create or replace function public.link_aplicar_evento(p_evento uuid, p_tipo text, p_dados jsonb)
returns text language plpgsql security definer set search_path = public as $$
declare l link_cobrancas; c lic_cobrancas; v_res text; v_pago numeric; v_data date; v_baixa bigint;
begin
  if p_evento is null or coalesce(p_tipo, '') = '' then raise exception 'Aviso sem identificação'; end if;
  insert into link_eventos (id_evento, tipo, detalhe) values (p_evento, p_tipo, p_dados) on conflict do nothing;
  if not found then return 'repetido'; end if;

  if p_tipo not like 'cobranca.%' then
    update link_eventos set resultado = 'ignorado' where id_evento = p_evento;
    return 'ignorado';
  end if;

  select * into l from link_cobrancas where cobranca_link_id = nullif(p_dados ->> 'cobranca_id', '')::uuid for update;
  if l.lic_cobranca_id is null then
    update link_eventos set resultado = 'cobranca_desconhecida' where id_evento = p_evento;
    return 'cobranca_desconhecida';
  end if;
  update link_eventos set org_id = l.org_id where id_evento = p_evento;
  select * into c from lic_cobrancas where id = l.lic_cobranca_id for update;

  if p_tipo = 'cobranca.paga' then
    v_pago := round(coalesce((p_dados ->> 'valor_pago')::numeric, 0), 2);
    v_data := coalesce(((p_dados ->> 'pago_em')::timestamptz at time zone
                (select coalesce(fuso, 'America/Sao_Paulo') from organizacoes where id = c.org_id))::date, app.hoje(c.org_id));
    if v_pago <= 0 then v_res := 'valor_invalido';
    elsif v_pago < c.valor then
      v_res := 'pagamento_parcial';                       -- não baixa sozinho: a equipe decide
      update link_cobrancas set situacao = 'paga_parcial', atualizado_em = now() where lic_cobranca_id = c.id;
    elsif c.situacao = 'paga' then
      v_res := 'ja_baixada';                              -- alguém deu baixa manual antes do aviso
      update link_cobrancas set situacao = 'paga', atualizado_em = now() where lic_cobranca_id = c.id;
    elsif c.situacao = 'cancelada' then
      v_res := 'paga_mas_cancelada';                      -- pagaram uma mensalidade cancelada: revisar
      update link_cobrancas set situacao = 'paga', atualizado_em = now() where lic_cobranca_id = c.id;
    else
      insert into lic_baixas (org_id, cliente_id, cobranca_id, data, valor, juros, desconto, forma, observacao, por)
      values (c.org_id, c.cliente_id, c.id, v_data, c.valor, greatest(v_pago - c.valor, 0), 0,
              case when l.tipo = 'boleto' then 'Boleto (Ledgra Link)' else 'Pix/Boleto (Ledgra Link)' end,
              'Baixa automática pelo aviso do banco (Ledgra Link)', null)
      returning id into v_baixa;
      update lic_cobrancas set situacao = 'paga', pago_em = v_data, valor_pago = v_pago where id = c.id;
      update link_cobrancas set situacao = 'paga', atualizado_em = now() where lic_cobranca_id = c.id;
      insert into hub_auditoria (org_id, user_id, app, acao, alvo, antes, depois)
      values (c.org_id, null, 'licencas', 'baixar_cobranca', c.id::text, null,
              jsonb_build_object('baixa', v_baixa, 'data', v_data, 'total', v_pago, 'origem', 'Ledgra Link', 'evento', p_evento));
      v_res := 'baixada';
    end if;
  elsif p_tipo in ('cobranca.baixada', 'cobranca.cancelada', 'cobranca.vencida', 'cobranca.rejeitada') then
    update link_cobrancas set situacao = replace(p_tipo, 'cobranca.', ''), atualizado_em = now()
     where lic_cobranca_id = c.id and situacao <> 'paga';
    v_res := 'situacao_atualizada';
  else
    v_res := 'ignorado';
  end if;
  update link_eventos set resultado = v_res where id_evento = p_evento;
  return v_res;
end $$;
comment on function public.link_aplicar_evento(uuid, text, jsonb) is
  'Só a Função Edge ledgra-link-webhook (service_role): aplica o aviso do Ledgra Link uma vez só; cobrança paga = baixa automática.';

-- Permissões: tela chama só as duas primeiras; as de gravação pelo servidor ficam só com service_role
revoke all on function public.link_salvar_config(uuid, jsonb) from public, anon;
revoke all on function public.link_pode_emitir(uuid) from public, anon;
revoke all on function public.link_registrar_emissao(uuid, uuid, jsonb) from public, anon, authenticated;
revoke all on function public.link_aplicar_evento(uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.link_salvar_config(uuid, jsonb), public.link_pode_emitir(uuid) to authenticated;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function public.link_registrar_emissao(uuid, uuid, jsonb), public.link_aplicar_evento(uuid, text, jsonb) to service_role';
    execute 'grant select on public.link_config, public.link_cobrancas, public.link_eventos to service_role';
  end if;
end $$;
