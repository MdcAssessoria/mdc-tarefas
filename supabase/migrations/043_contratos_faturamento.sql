-- =====================================================================================================
--  043 · Contratos: faturamento dos contratos a receber (etapa 1, sem integrações externas)
--
--  Pedido do Edvaldo (03/11/2026): "No contrato precisa ter um campo que informe se este contrato gerará nota fiscal ou
--  nota fatura. Se o contrato é recorrente precisa ter a data em que a recorrência será gerada. Uma vez agendados, segue
--  a automatização e envio aos clientes. Se tem NF gera-se as notas e envia ao cliente (nota fiscal + fatura + boleto),
--  ou só a fatura e nota fiscal deixando o boleto para depois, ou só fatura e boleto, ou só a fatura."
--  Decisões dele: NFS-e pelo Emissor Nacional (etapa 2, não aqui); boleto com plataforma ainda não escolhida ("a definir");
--  canais e-mail, WhatsApp e Portal do Cliente; recorrência com "dia de gerar" e "dia de vencer" separados.
--
--   1  fin_recorrentes (só contrato A RECEBER usa; a pagar fica como na 041):
--        documento   'nfse' (nota fiscal de serviço) | 'fatura' (nota fatura, sem NF)
--        envio       'nf_fatura_boleto' | 'nf_fatura' (boleto depois) | 'fatura_boleto' | 'fatura'
--                    os dois primeiros só com documento = 'nfse'; os dois últimos só com 'fatura'
--        dia_geracao 1–28 (todo mês tem). REGRA DO MÊS DO VENCIMENTO (derivada, não gravada):
--                    dia_vencimento <= dia_geracao → vence no MÊS SEGUINTE ao da geração;
--                    dia_vencimento >  dia_geracao → vence no MESMO mês.
--                    Ex.: gera 25, vence 5 → fatura de 11/2026 gerada em 25/11 e vencendo em 05/12.
--                         gera 1, vence 10 → gerada em 01/11 e vencendo em 10/11.  Gera 10, vence 10 → 10 do mês seguinte.
--                    O dia de vencer 29–31 continua virando o último dia do mês quando o mês não tem o dia (041).
--        canais      text[] com 'email', 'whatsapp', 'portal' (vazio = ninguém recebe automaticamente)
--        email_envio, whatsapp_envio, cliente_carteira_id (cadastro do cliente em public.clientes, para o Portal)
--        servico_descricao, servico_codigo (código de tributação nacional / item da LC 116), iss_aliquota (0–5%):
--                    obrigatórios com NFS-e (vão para a nota na etapa 2)
--      Defaults: documento 'fatura', envio 'fatura', dia_geracao 1, canais vazio → contratos já cadastrados continuam
--      gerando no dia 1 (a pagar: vencimento no mesmo mês, sem mudança). Contrato a receber com vencimento dia 1 e
--      geração dia 1 passa a vencer no dia 1 do mês seguinte (regra acima). Produção não tem contratos (03/11/2026).
--   2  fin_faturas: uma fatura por conta a receber gerada pelo contrato, número AAAA/NNNNN por organização e ano de
--      emissão, sem repetir (trava consultiva, como a 038). Situação: gerada (sem canal de envio) → aguardando_nf
--      (NFS-e a emitir, etapa 2) → pronta (falta enviar) → enviada; ou cancelada (com motivo; cancela junto a conta em
--      aberto sem recebimento). NFS-e: nao_se_aplica | a_emitir | emitida | erro. Boleto: nao_se_aplica | a_definir | gerado.
--   3  fin_envios: fila de envio por fatura e canal. Sem envio real nesta etapa: e-mail e WhatsApp ficam
--      'aguardando_configuracao'; Portal é marcado como publicado ('enviado') quando a fatura não depende da NFS-e e o
--      cliente lê pela função portal_minhas_faturas(p_cliente) (só as faturas dele, permissão 'documentos' do Portal).
--   4  Rotina: app.fin_recorrentes_gerar passa a gerar no dia de gerar (não mais fixo no dia 1), criando conta + fatura
--      + fila; idempotente e segura em concorrência (trava o contrato; índice único por contrato e mês das contas e das
--      faturas não canceladas). Mês com conta cancelada não é gerado de novo pela rotina; à mão, com motivo, sim.
--      BD-02 (reauditoria 03/11): rotina e geração só olham a empresa da gestão (app.empresa_gestao) e tratam erro
--      contrato a contrato (renovação, geração e encerramento), registrando 'recorrente_falha' sem derrubar a rotina.
--      BD-01: fis_captura_reservar só cria/reserva controle da empresa da gestão.
--   5  Funções da tela: fin_recorrente_salvar (campos novos; chamadas antigas continuam valendo), fin_fatura_cancelar,
--      fin_fatura_gerar_agora (gerar um mês à mão, com motivo, sem duplicar — resolve o B-06 de meses perdidos) e
--      portal_minhas_faturas.
--
--  NÃO APLICAR pela frente: quem integra aplica. Testes: supabase/testes/99_base_043.sql e 100_faturamento_043.sql.
-- =====================================================================================================

-- ===================================================================================================== 1 contrato
alter table public.fin_recorrentes
  add column if not exists documento text not null default 'fatura',
  add column if not exists envio text not null default 'fatura',
  add column if not exists dia_geracao integer not null default 1,
  add column if not exists canais text[] not null default '{}',
  add column if not exists email_envio text,
  add column if not exists whatsapp_envio text,
  add column if not exists servico_descricao text,
  add column if not exists servico_codigo text,
  add column if not exists iss_aliquota numeric(5, 2),
  add column if not exists cliente_carteira_id uuid references public.clientes(id) on delete restrict;

do $$
declare c record;
begin
  for c in select * from (values
    ('fin_recorrentes_documento', 'check (documento in (''nfse'', ''fatura''))'),
    ('fin_recorrentes_envio', 'check (envio in (''nf_fatura_boleto'', ''nf_fatura'', ''fatura_boleto'', ''fatura''))'),
    ('fin_recorrentes_envio_documento', 'check ((envio in (''nf_fatura_boleto'', ''nf_fatura'')) = (documento = ''nfse''))'),
    ('fin_recorrentes_dia_geracao', 'check (dia_geracao between 1 and 28)'),
    ('fin_recorrentes_canais', 'check (canais <@ array[''email'', ''whatsapp'', ''portal'']::text[])'),
    ('fin_recorrentes_iss', 'check (iss_aliquota is null or (iss_aliquota >= 0 and iss_aliquota <= 5))'),
    ('fin_recorrentes_pagar_sem_fatura', 'check (tipo = ''receber'' or (documento = ''fatura'' and envio = ''fatura'' and canais = ''{}'' and dia_geracao = 1))'),
    ('fin_recorrentes_nfse_servico', 'check (documento <> ''nfse'' or (servico_descricao is not null and servico_codigo is not null and iss_aliquota is not null))'),
    ('fin_recorrentes_canal_email', 'check (not (''email'' = any (canais)) or email_envio is not null)'),
    ('fin_recorrentes_canal_whatsapp', 'check (not (''whatsapp'' = any (canais)) or whatsapp_envio is not null)'),
    ('fin_recorrentes_canal_portal', 'check (not (''portal'' = any (canais)) or cliente_carteira_id is not null)')
  ) x(nome, regra) loop
    if not exists (select 1 from pg_constraint where conname = c.nome) then
      execute format('alter table public.fin_recorrentes add constraint %I %s', c.nome, c.regra);
    end if;
  end loop;
end $$;

comment on column public.fin_recorrentes.documento is 'Contrato a receber: nfse = sai nota fiscal de serviço (etapa 2, Emissor Nacional); fatura = só nota fatura (043).';
comment on column public.fin_recorrentes.envio is 'O que vai ao cliente: nf_fatura_boleto, nf_fatura (boleto depois), fatura_boleto ou fatura (043).';
comment on column public.fin_recorrentes.dia_geracao is 'Dia do mês (1–28) em que a conta e a fatura nascem. Vencimento <= dia de gerar → vence no mês seguinte (043). A pagar: sempre 1.';
comment on column public.fin_recorrentes.canais is 'Canais de envio da fatura: email, whatsapp, portal (043). Vazio = ninguém recebe automaticamente.';
comment on column public.fin_recorrentes.cliente_carteira_id is 'Cadastro do cliente na carteira (public.clientes) que vê a fatura no Portal (043).';
comment on column public.fin_recorrentes.servico_codigo is 'Código de tributação nacional (ex.: 17.01.01) ou item da LC 116 (ex.: 17.01), para a NFS-e (043).';

-- o histórico ganha o tipo 'fatura'
alter table public.fin_recorrente_eventos drop constraint if exists fin_recorrente_eventos_tipo_check;
alter table public.fin_recorrente_eventos add constraint fin_recorrente_eventos_tipo_check
  check (tipo in ('criado', 'editado', 'valor', 'conta', 'reajuste', 'suspenso', 'reativado', 'encerrado', 'renovado', 'aviso',
                  'anexo', 'fatura'));

-- conta do mês: uma ATIVA por contrato e mês (a cancelada não impede gerar de novo à mão; a rotina não regera)
drop index if exists public.fin_titulos_recorrente_mes;
create unique index if not exists fin_titulos_recorrente_mes_ativa on public.fin_titulos (recorrente_id, competencia)
  where recorrente_id is not null and situacao <> 'cancelado';

-- ===================================================================================================== 2 faturas
create table if not exists public.fin_faturas (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizacoes(id) on delete cascade,
  cliente_id uuid not null references public.clientes(id) on delete restrict,
  recorrente_id uuid not null references public.fin_recorrentes(id) on delete restrict,
  titulo_id uuid not null unique references public.fin_titulos(id) on delete restrict,
  pessoa_id uuid not null references public.fin_pessoas(id) on delete restrict,
  cliente_carteira_id uuid references public.clientes(id) on delete restrict,
  ano integer not null,
  sequencia integer not null check (sequencia > 0),
  numero text not null,
  competencia date not null check (competencia = date_trunc('month', competencia)::date),
  emissao date not null,
  vencimento date not null,
  valor numeric(15, 2) not null check (valor > 0 and valor not in ('NaN'::numeric, 'Infinity'::numeric)),
  descricao text not null check (length(trim(descricao)) > 0),
  servico_codigo text,
  iss_aliquota numeric(5, 2) check (iss_aliquota is null or (iss_aliquota >= 0 and iss_aliquota <= 5)),
  documento text not null check (documento in ('nfse', 'fatura')),
  envio text not null check (envio in ('nf_fatura_boleto', 'nf_fatura', 'fatura_boleto', 'fatura')),
  situacao text not null check (situacao in ('gerada', 'aguardando_nf', 'pronta', 'enviada', 'cancelada')),
  nfse_situacao text not null check (nfse_situacao in ('nao_se_aplica', 'a_emitir', 'emitida', 'erro')),
  nfse_numero text,
  boleto_situacao text not null check (boleto_situacao in ('nao_se_aplica', 'a_definir', 'gerado')),
  origem text not null default 'rotina' check (origem in ('rotina', 'manual')),
  motivo_manual text,
  cancelada_em timestamptz,
  cancelada_por uuid,
  cancelamento_motivo text,
  por uuid,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (org_id, ano, sequencia),
  unique (org_id, numero),
  check (numero = ano::text || '/' || lpad(sequencia::text, 5, '0')),
  check ((documento = 'nfse') = (nfse_situacao <> 'nao_se_aplica')),
  check ((envio = 'fatura') = (boleto_situacao = 'nao_se_aplica')),
  check (situacao <> 'cancelada' or (cancelamento_motivo is not null and cancelada_em is not null)),
  check (origem = 'rotina' or motivo_manual is not null),
  check (vencimento >= competencia)
);
create unique index if not exists fin_faturas_contrato_mes on public.fin_faturas (recorrente_id, competencia) where situacao <> 'cancelada';
create index if not exists fin_faturas_cliente on public.fin_faturas (cliente_id, emissao);
create index if not exists fin_faturas_carteira on public.fin_faturas (cliente_carteira_id) where cliente_carteira_id is not null;
comment on table public.fin_faturas is
  'Faturas dos contratos a receber (043): uma por conta do mês, número AAAA/NNNNN sem repetir por organização e ano. Grava só pelas funções; nada se apaga.';
comment on column public.fin_faturas.situacao is
  'gerada (sem canal de envio) · aguardando_nf (NFS-e a emitir) · pronta (falta enviar) · enviada (todos os canais) · cancelada (043).';

create table if not exists public.fin_envios (
  id bigint generated always as identity primary key,
  org_id uuid not null references public.organizacoes(id) on delete cascade,
  cliente_id uuid not null references public.clientes(id) on delete restrict,
  fatura_id uuid not null references public.fin_faturas(id) on delete restrict,
  canal text not null check (canal in ('email', 'whatsapp', 'portal')),
  destino text not null,
  conteudo text[] not null check (conteudo <@ array['nfse', 'fatura', 'boleto']::text[] and 'fatura' = any (conteudo)),
  situacao text not null check (situacao in ('pendente', 'enviado', 'erro', 'aguardando_configuracao', 'cancelado')),
  tentativas integer not null default 0 check (tentativas >= 0),
  ultimo_erro text,
  enviado_em timestamptz,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (fatura_id, canal),
  check (situacao <> 'enviado' or enviado_em is not null)
);
comment on table public.fin_envios is
  'Fila de envio das faturas (043): um item por fatura e canal. E-mail e WhatsApp aguardam configuração; Portal = publicado.';
comment on column public.fin_envios.conteudo is 'O que vai neste envio: fatura sempre; nfse e boleto conforme o "O que enviar" do contrato.';

-- segurança: leitura pelo módulo Contratos; gravação só pelas funções; nada se apaga; só a empresa da gestão
alter table public.fin_faturas enable row level security;
alter table public.fin_envios enable row level security;
drop policy if exists contratos_ver on public.fin_faturas;
create policy contratos_ver on public.fin_faturas for select to authenticated using (app.contratos_pode(cliente_id, 'ver'));
drop policy if exists contratos_ver on public.fin_envios;
create policy contratos_ver on public.fin_envios for select to authenticated using (app.contratos_pode(cliente_id, 'ver'));
revoke insert, update, delete, truncate on public.fin_faturas, public.fin_envios from anon, authenticated;
revoke all on public.fin_faturas, public.fin_envios from anon;
grant select on public.fin_faturas, public.fin_envios to authenticated;

drop trigger if exists nada_se_apaga on public.fin_faturas;
create trigger nada_se_apaga before delete on public.fin_faturas
  for each row execute function app.tg_nada_se_apaga('cancele a fatura (com motivo)');
drop trigger if exists nada_se_apaga on public.fin_envios;
create trigger nada_se_apaga before delete on public.fin_envios
  for each row execute function app.tg_nada_se_apaga('o histórico de envios é permanente');
do $$
declare t text;
begin
  foreach t in array array['fin_faturas', 'fin_envios'] loop
    execute format('drop trigger if exists gestao_so_empresa on public.%I', t);
    execute format('create trigger gestao_so_empresa before insert or update of cliente_id on public.%I
                      for each row execute function app.tg_gestao_so_empresa()', t);
    execute format('drop trigger if exists cliente_mesma_org on public.%I', t);
    execute format('create trigger cliente_mesma_org before insert or update of cliente_id, org_id on public.%I
                      for each row execute function app.tg_cliente_mesma_org()', t);
  end loop;
end $$;

/** Fatura: número, empresa, contrato, conta e mês não mudam depois de gerada. */
create or replace function app.tg_fin_fatura_fixa()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.numero is distinct from old.numero or new.ano is distinct from old.ano or new.sequencia is distinct from old.sequencia
     or new.org_id is distinct from old.org_id or new.cliente_id is distinct from old.cliente_id
     or new.recorrente_id is distinct from old.recorrente_id or new.titulo_id is distinct from old.titulo_id
     or new.competencia is distinct from old.competencia or new.emissao is distinct from old.emissao then
    raise exception 'Número, empresa, contrato, conta, mês e emissão da fatura não mudam';
  end if;
  if old.situacao = 'cancelada' and new.situacao <> 'cancelada' then raise exception 'Fatura cancelada não volta'; end if;
  new.atualizado_em := now();
  return new;
end $$;
revoke all on function app.tg_fin_fatura_fixa() from public, anon, authenticated;
drop trigger if exists fatura_fixa on public.fin_faturas;
create trigger fatura_fixa before update on public.fin_faturas for each row execute function app.tg_fin_fatura_fixa();

-- ===================================================================================================== 3 datas do mês
/** Dia em que a conta/fatura do mês nasce: a receber no dia de gerar; a pagar no dia 1 (041). */
create or replace function app.fin_recorrente_data_geracao(p_mes date, p_tipo text, p_dia_geracao int)
returns date language sql immutable set search_path = '' as $$
  select make_date(extract(year from p_mes)::int, extract(month from p_mes)::int,
                   case when p_tipo = 'receber' then greatest(1, least(coalesce(p_dia_geracao, 1), 28)) else 1 end)
$$;
revoke all on function app.fin_recorrente_data_geracao(date, text, int) from public, anon, authenticated;

/**
 * Vencimento da conta do mês. A receber: dia de vencer <= dia de gerar → mês seguinte; senão o mesmo mês.
 * A pagar: sempre o mesmo mês (041). Dia que o mês não tem vira o último dia (app.fin_vencimento_no_mes).
 */
create or replace function app.fin_recorrente_vencimento(p_mes date, p_tipo text, p_dia_geracao int, p_dia_vencimento int)
returns date language sql immutable set search_path = '' as $$
  select app.fin_vencimento_no_mes(
           case when p_tipo = 'receber' and p_dia_vencimento <= coalesce(p_dia_geracao, 1)
                then (date_trunc('month', p_mes) + interval '1 month')::date
                else date_trunc('month', p_mes)::date end,
           p_dia_vencimento)
$$;
revoke all on function app.fin_recorrente_vencimento(date, text, int, int) from public, anon, authenticated;

-- ===================================================================================================== 4 geração
/** Recalcula a situação da fatura a partir da NFS-e e da fila (cancelada não muda). */
create or replace function app.fin_fatura_situacao(p_fatura uuid)
returns text language plpgsql security definer set search_path = public as $$
declare f fin_faturas; v text;
begin
  select * into f from fin_faturas where id = p_fatura;
  if f.id is null or f.situacao = 'cancelada' then return f.situacao; end if;
  v := case
         when f.nfse_situacao in ('a_emitir', 'erro') then 'aguardando_nf'
         when not exists (select 1 from fin_envios where fatura_id = f.id) then 'gerada'
         when not exists (select 1 from fin_envios where fatura_id = f.id and situacao <> 'enviado') then 'enviada'
         else 'pronta' end;
  if v is distinct from f.situacao then update fin_faturas set situacao = v where id = f.id; end if;
  return v;
end $$;
revoke all on function app.fin_fatura_situacao(uuid) from public, anon, authenticated;

/**
 * Processa a fila da fatura. Etapa 1: só o Portal é "enviado" (publicado para o cliente da carteira), e só quando a
 * fatura não depende mais da NFS-e. E-mail e WhatsApp continuam 'aguardando_configuracao'.
 */
create or replace function app.fin_fatura_processar(p_fatura uuid)
returns text language plpgsql security definer set search_path = public as $$
declare f fin_faturas;
begin
  select * into f from fin_faturas where id = p_fatura;
  if f.id is null or f.situacao = 'cancelada' then return f.situacao; end if;
  if f.nfse_situacao not in ('a_emitir', 'erro') then
    update fin_envios set situacao = 'enviado', enviado_em = now(), tentativas = tentativas + 1, atualizado_em = now()
     where fatura_id = f.id and canal = 'portal' and situacao = 'pendente';
  end if;
  return app.fin_fatura_situacao(f.id);
end $$;
revoke all on function app.fin_fatura_processar(uuid) from public, anon, authenticated;

/**
 * Lança o mês de UM contrato já travado (for update): conta no Financeiro (app.fin_lancar_titulos) e, se a receber,
 * a fatura numerada e a fila de envio. Não confere permissão nem duplicidade: quem chama confere.
 * p_venc nulo = vencimento pela regra do contrato. p_motivo preenchido = geração à mão (fin_fatura_gerar_agora).
 */
create or replace function app.fin_recorrente_lancar_mes(p_contrato uuid, p_mes date, p_venc date default null, p_motivo text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  k fin_recorrentes; v_mes date := date_trunc('month', p_mes)::date; v_hoje date; v_venc date; r jsonb; v_titulo uuid;
  v_fatura uuid; v_ano int; v_seq int; v_numero text; v_fin text := current_setting('app.fin_interno', true);
  v_conteudo text[]; v_canal text; v_sit_envio text; v_destino text; v_sit text;
begin
  select * into k from fin_recorrentes where id = p_contrato;
  v_hoje := app.hoje(k.org_id);
  v_venc := coalesce(p_venc, app.fin_recorrente_vencimento(v_mes, k.tipo, k.dia_geracao, k.dia_vencimento));
  if k.tipo = 'receber' then
    -- número sem repetir: uma trava por organização e ano (mesmo jeito da 038)
    v_ano := extract(year from v_hoje)::int;
    perform pg_advisory_xact_lock(hashtext('fin_fatura_numero:' || k.org_id::text || ':' || v_ano));
    select coalesce(max(sequencia), 0) + 1 into v_seq from fin_faturas where org_id = k.org_id and ano = v_ano;
    v_numero := v_ano || '/' || lpad(v_seq::text, 5, '0');
  end if;
  r := app.fin_lancar_titulos(jsonb_build_object(
    'cliente', k.cliente_id, 'tipo', k.tipo, 'pessoa', k.pessoa_id, 'categoria', k.categoria_id,
    'centro', k.centro_id, 'conta_prevista', k.conta_prevista_id,
    'descricao', k.descricao || ' · ' || to_char(v_mes, 'MM/YYYY'),
    'documento', case when v_numero is not null then 'Fatura ' || v_numero end,
    'emissao', case when v_numero is not null then v_hoje end,
    'vencimento', v_venc, 'valor', k.valor, 'parcelas', 1,
    'observacao', case when p_motivo is null then 'Lançada pelo contrato fixo' else 'Lançada à mão pelo contrato fixo: ' || p_motivo end));
  v_titulo := (r->'titulos'->>0)::uuid;
  perform set_config('app.fin_interno', '1', true);
  update fin_titulos set recorrente_id = k.id, competencia = v_mes where id = v_titulo;
  perform set_config('app.fin_interno', coalesce(v_fin, ''), true);
  update fin_recorrentes set ultima_competencia = greatest(ultima_competencia, v_mes) where id = k.id;
  perform app.registrar(k.org_id, 'financeiro', 'recorrente_gerar', k.id::text, null,
    jsonb_build_object('competencia', v_mes, 'titulo', v_titulo, 'valor', k.valor, 'manual', p_motivo is not null, 'motivo', p_motivo));
  perform app.fin_recorrente_evento(k.id, 'conta', format('Conta de %s lançada em %s (%s)%s', to_char(v_mes, 'MM/YYYY'),
    case when k.tipo = 'pagar' then 'Contas a pagar' else 'Contas a receber' end, app.fin_brl(k.valor),
    case when p_motivo is not null then ' à mão: ' || p_motivo else '' end),
    jsonb_build_object('titulo', v_titulo, 'competencia', v_mes));

  if k.tipo = 'receber' then
    insert into fin_faturas (org_id, cliente_id, recorrente_id, titulo_id, pessoa_id, cliente_carteira_id, ano, sequencia, numero,
                             competencia, emissao, vencimento, valor, descricao, servico_codigo, iss_aliquota, documento, envio,
                             situacao, nfse_situacao, boleto_situacao, origem, motivo_manual, por)
    values (k.org_id, k.cliente_id, k.id, v_titulo, k.pessoa_id, k.cliente_carteira_id, v_ano, v_seq, v_numero,
            v_mes, v_hoje, v_venc, k.valor,
            coalesce(k.servico_descricao, k.descricao) || ' · ' || to_char(v_mes, 'MM/YYYY'),
            k.servico_codigo, k.iss_aliquota, k.documento, k.envio, 'gerada',
            case when k.documento = 'nfse' then 'a_emitir' else 'nao_se_aplica' end,
            case when k.envio = 'fatura' then 'nao_se_aplica' else 'a_definir' end,
            case when p_motivo is null then 'rotina' else 'manual' end, p_motivo, auth.uid())
    returning id into v_fatura;
    -- o que vai em cada envio: "boleto depois" (nf_fatura) manda NF + fatura agora; o boleto sai num envio futuro
    v_conteudo := case k.envio when 'nf_fatura_boleto' then array['nfse', 'fatura', 'boleto'] when 'nf_fatura' then array['nfse', 'fatura']
                               when 'fatura_boleto' then array['fatura', 'boleto'] else array['fatura'] end;
    foreach v_canal in array k.canais loop
      v_destino := case v_canal when 'email' then k.email_envio when 'whatsapp' then k.whatsapp_envio
                                when 'portal' then k.cliente_carteira_id::text end;
      continue when v_destino is null;
      v_sit_envio := case when v_canal = 'portal' then 'pendente' else 'aguardando_configuracao' end;
      insert into fin_envios (org_id, cliente_id, fatura_id, canal, destino, conteudo, situacao)
      values (k.org_id, k.cliente_id, v_fatura, v_canal, v_destino, v_conteudo, v_sit_envio);
    end loop;
    v_sit := app.fin_fatura_processar(v_fatura);
    perform app.registrar(k.org_id, 'contratos', 'fatura_gerar', v_fatura::text, null,
      jsonb_build_object('numero', v_numero, 'contrato', k.id, 'competencia', v_mes, 'valor', k.valor, 'vencimento', v_venc,
                         'documento', k.documento, 'envio', k.envio, 'canais', k.canais, 'manual', p_motivo is not null, 'motivo', p_motivo));
    perform app.fin_recorrente_evento(k.id, 'fatura', format('Fatura %s de %s gerada (%s, vence %s)', v_numero, to_char(v_mes, 'MM/YYYY'),
      app.fin_brl(k.valor), to_char(v_venc, 'DD/MM/YYYY')), jsonb_build_object('fatura', v_fatura, 'numero', v_numero));
  end if;
  return jsonb_build_object('titulo', v_titulo, 'fatura', v_fatura, 'numero', v_numero, 'vencimento', v_venc, 'situacao', v_sit);
end $$;
revoke all on function app.fin_recorrente_lancar_mes(uuid, date, date, text) from public, anon, authenticated;

/**
 * Lança o mês dos contratos ativos da organização (ou de um contrato) cujo dia de gerar já chegou. Só a empresa da
 * gestão (BD-02). Idempotente: trava o contrato e confere se o mês já tem conta (inclusive cancelada); os índices
 * únicos das contas e faturas ativas seguram o resto. Um contrato com problema não impede os outros: o erro vai para a
 * auditoria (recorrente_falha).
 */
create or replace function app.fin_recorrentes_gerar(p_org uuid, p_mes date, p_contrato uuid default null)
returns int language plpgsql security definer set search_path = public as $$
declare
  v_mes date := date_trunc('month', p_mes)::date; k fin_recorrentes; n int := 0; v_hoje date := app.hoje(p_org);
  v_fin text := current_setting('app.fin_interno', true);
begin
  for k in select * from fin_recorrentes
            where org_id = p_org and (p_contrato is null or id = p_contrato) and situacao = 'ativo' and gera_contas
              and app.empresa_gestao(cliente_id)
              and gerar_desde <= v_mes and (fim is null or fim >= v_mes)
              and app.fin_recorrente_data_geracao(v_mes, tipo, dia_geracao) <= v_hoje
              and not exists (select 1 from fin_titulos t where t.recorrente_id = fin_recorrentes.id and t.competencia = v_mes)
            order by id
  loop
    begin
      -- trava e confere de novo (duas rotinas ao mesmo tempo não lançam o mesmo mês)
      select * into k from fin_recorrentes where id = k.id for update;
      continue when k.situacao <> 'ativo' or not k.gera_contas
                 or exists (select 1 from fin_titulos t where t.recorrente_id = k.id and t.competencia = v_mes);
      perform app.fin_recorrente_lancar_mes(k.id, v_mes);
      n := n + 1;
    exception when others then
      perform set_config('app.fin_interno', coalesce(v_fin, ''), true);
      perform app.registrar(k.org_id, 'financeiro', 'recorrente_falha', k.id::text, null,
        jsonb_build_object('competencia', v_mes, 'etapa', 'gerar', 'erro', sqlerrm));
      -- contador da rotina (vale até o fim da transação)
      perform set_config('app.fin_falhas', (coalesce(nullif(current_setting('app.fin_falhas', true), ''), '0')::int + 1)::text, true);
    end;
  end loop;
  return n;
end $$;
revoke all on function app.fin_recorrentes_gerar(uuid, date, uuid) from public, anon, authenticated;
comment on function app.fin_recorrentes_gerar(uuid, date, uuid) is
  'Lança conta (e fatura, se a receber) do mês dos contratos ativos da empresa da gestão cujo dia de gerar chegou. Idempotente; erro por contrato vai para a auditoria (043).';

-- ===================================================================================================== 5 rotina (BD-02)
/**
 * Rotina diária (pg_cron financeiro-recorrentes, 06h30 de Brasília). Só contratos da empresa da gestão; cada contrato
 * (renovação, geração, encerramento) e cada aviso num bloco próprio: um erro vai para a auditoria e a rotina segue.
 * Geração: mês atual (contratos cujo dia de gerar já chegou) e o anterior (recuperação), sem duplicar.
 */
create or replace function app.fin_recorrentes_rotina()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  o record; k record; u record; v_mes date; v_ger int := 0; v_enc int := 0; v_avisos int := 0; v_ind int := 0; v_falhas int := 0;
  v_nomes text[]; v_ids uuid[]; v_refs date[]; v_hoje date; v_novo date; v_fins text[]; v_ren int := 0;
begin
  perform set_config('app.fin_falhas', '0', true);
  begin
    v_ind := app.fin_indices_ler();
  exception when others then
    raise notice 'Leitura dos índices falhou: %', sqlerrm;
  end;
  for o in select distinct org_id as id from fin_recorrentes where situacao <> 'encerrado' and app.empresa_gestao(cliente_id) loop
    v_hoje := app.hoje(o.id);
    v_mes := date_trunc('month', v_hoje)::date;

    -- renovação automática: a vigência que acabou ganha mais 12 meses (quantas vezes precisar)
    for k in select id, vigencia_fim from fin_recorrentes where org_id = o.id and situacao <> 'encerrado' and renovacao_automatica
                and app.empresa_gestao(cliente_id) and vigencia_fim is not null and vigencia_fim < v_hoje order by id loop
      begin
        perform 1 from fin_recorrentes where id = k.id for update;
        v_novo := k.vigencia_fim;
        while v_novo < v_hoje loop v_novo := (v_novo + interval '12 months')::date; end loop;
        update fin_recorrentes set vigencia_fim = v_novo, aviso_fim_enviado = null, atualizado_em = now() where id = k.id;
        perform app.fin_recorrente_evento(k.id, 'renovado', format('Renovado automaticamente: vigência até %s', to_char(v_novo, 'DD/MM/YYYY')));
        perform app.registrar(o.id, 'contratos', 'contrato_renovar', k.id::text, jsonb_build_object('vigencia_fim', k.vigencia_fim),
          jsonb_build_object('vigencia_fim', v_novo, 'por', 'rotina diária'));
        v_ren := v_ren + 1;
      exception when others then
        v_falhas := v_falhas + 1;
        perform app.registrar(o.id, 'financeiro', 'recorrente_falha', k.id::text, null, jsonb_build_object('etapa', 'renovar', 'erro', sqlerrm));
      end;
    end loop;

    v_ger := v_ger + app.fin_recorrentes_gerar(o.id, v_mes) + app.fin_recorrentes_gerar(o.id, (v_mes - interval '1 month')::date);

    for k in select * from fin_recorrentes where org_id = o.id and situacao <> 'encerrado' and fim is not null and fim < v_mes
                and app.empresa_gestao(cliente_id) order by id loop
      begin
        perform 1 from fin_recorrentes where id = k.id for update;
        update fin_recorrentes set situacao = 'encerrado', situacao_motivo = 'Fim do prazo do contrato', situacao_em = now(),
               encerrado_em = (k.fim + interval '1 month - 1 day')::date, atualizado_em = now() where id = k.id;
        perform app.fin_recorrente_evento(k.id, 'encerrado', 'Encerrado pela rotina: fim do prazo do contrato');
        perform app.registrar(o.id, 'contratos', 'contrato_encerrar', k.id::text, to_jsonb(k),
          jsonb_build_object('motivo', 'Fim do prazo do contrato', 'por', 'rotina diária'));
        v_enc := v_enc + 1;
      exception when others then
        v_falhas := v_falhas + 1;
        perform app.registrar(o.id, 'financeiro', 'recorrente_falha', k.id::text, null, jsonb_build_object('etapa', 'encerrar', 'erro', sqlerrm));
      end;
    end loop;

    -- avisos (reajuste do mês e fim de vigência): um bloco por organização
    begin
      select array_agg(descricao order by descricao), array_agg(id order by descricao), array_agg(ref order by descricao)
        into v_nomes, v_ids, v_refs
        from (select r.id, r.descricao, app.fin_reajuste_pendente(r.id) as ref from fin_recorrentes r
               where r.org_id = o.id and r.situacao = 'ativo' and r.indice <> 'nenhum' and app.empresa_gestao(r.cliente_id)) x
       where ref is not null and ref is distinct from (select reajuste_avisado from fin_recorrentes where id = x.id);
      if coalesce(cardinality(v_ids), 0) > 0 then
        for u in select m.user_id from membros m
                  where m.org_id = o.id and m.ativo
                    and (m.papel::text = 'admin' or exists (select 1 from hub_acessos a where a.org_id = o.id and a.user_id = m.user_id
                                                              and a.app = 'contratos' and a.papel = 'gerir'))
        loop
          perform app.notificar(o.id, u.user_id, 'contratos', 'Contratos: reajuste do mês',
            format('%s contrato(s) chegaram ao mês do reajuste: %s. Confira a proposta e confirme.', cardinality(v_ids),
                   array_to_string(v_nomes[1:5], ', ') || case when cardinality(v_ids) > 5 then '…' else '' end),
            '/contratos/reajustes');
          v_avisos := v_avisos + 1;
        end loop;
        for i in 1 .. cardinality(v_ids) loop
          update fin_recorrentes set reajuste_avisado = v_refs[i] where id = v_ids[i];
          perform app.fin_recorrente_evento(v_ids[i], 'aviso', format('Aviso no sino: reajuste de %s pendente', to_char(v_refs[i], 'MM/YYYY')));
        end loop;
      end if;

      select array_agg(id order by vigencia_fim), array_agg(format('%s (%s %s)', descricao,
               case when renovacao_automatica then 'renova em' else 'termina em' end, to_char(vigencia_fim, 'DD/MM/YYYY')) order by vigencia_fim)
        into v_ids, v_fins
        from fin_recorrentes
       where org_id = o.id and situacao <> 'encerrado' and app.empresa_gestao(cliente_id) and vigencia_fim is not null
         and vigencia_fim >= v_hoje and vigencia_fim - aviso_dias <= v_hoje and aviso_fim_enviado is distinct from vigencia_fim;
      if coalesce(cardinality(v_ids), 0) > 0 then
        for u in select m.user_id from membros m
                  where m.org_id = o.id and m.ativo
                    and (m.papel::text = 'admin' or exists (select 1 from hub_acessos a where a.org_id = o.id and a.user_id = m.user_id
                                                              and a.app = 'contratos' and a.papel = 'gerir'))
        loop
          perform app.notificar(o.id, u.user_id, 'contratos', 'Contratos: fim de vigência chegando',
            format('%s contrato(s): %s.', cardinality(v_ids), array_to_string(v_fins[1:5], '; ') ||
                   case when cardinality(v_ids) > 5 then '…' else '' end), '/contratos');
          v_avisos := v_avisos + 1;
        end loop;
        for i in 1 .. cardinality(v_ids) loop
          update fin_recorrentes set aviso_fim_enviado = vigencia_fim where id = v_ids[i];
          perform app.fin_recorrente_evento(v_ids[i], 'aviso', 'Aviso no sino: fim da vigência chegando');
        end loop;
      end if;
    exception when others then
      v_falhas := v_falhas + 1;
      perform app.registrar(o.id, 'financeiro', 'recorrente_falha', null, null, jsonb_build_object('etapa', 'avisos', 'erro', sqlerrm));
    end;
  end loop;
  return jsonb_build_object('geradas', v_ger, 'encerrados', v_enc, 'renovados', v_ren, 'avisos', v_avisos, 'indices', v_ind,
                            'falhas', v_falhas + coalesce(nullif(current_setting('app.fin_falhas', true), ''), '0')::int);
end $$;
revoke all on function app.fin_recorrentes_rotina() from public, anon, authenticated;
comment on function app.fin_recorrentes_rotina() is
  'pg_cron financeiro-recorrentes (06h30): só a empresa da gestão; renova vigências, lança contas e faturas no dia de gerar (e recupera o mês anterior) sem duplicar, encerra vencidos e avisa no sino; erro por contrato não derruba a rotina (043, BD-02).';

-- ===================================================================================================== 6 BD-01 captura de notas
/** Reserva as empresas a consultar na SEFAZ/ADN: só a empresa da gestão (um certificado de outra empresa não trava a captura). */
create or replace function public.fis_captura_reservar(p_limite int default 5, p_cliente uuid default null)
returns table (cliente_id uuid, org_id uuid, fonte text, ult_nsu bigint, cnpj text, uf text, ambiente text, ciencia_automatica boolean)
language plpgsql security definer set search_path = public as $$
begin
  insert into fis_dfe_controle (cliente_id, fonte, org_id)
  select f.cliente_id, x.fonte, f.org_id from fis_certificados f cross join (values ('nfe'), ('nfse')) x(fonte)
   where app.empresa_gestao(f.cliente_id)
  on conflict do nothing;
  return query
  with alvo as (
    select d.cliente_id, d.fonte from fis_dfe_controle d
      join fis_certificados f on f.cliente_id = d.cliente_id
      join fis_parametros pr on pr.cliente_id = d.cliente_id
      join clientes c on c.id = d.cliente_id
     where pr.captura_ativa and c.ativo and f.valido_ate > now()
       and app.empresa_gestao(d.cliente_id)
       and (p_cliente is null or d.cliente_id = p_cliente)
       and (d.bloqueado_ate is null or d.bloqueado_ate <= now())
       and (d.proxima_consulta_em is null or d.proxima_consulta_em <= now())
       and (d.em_execucao_ate is null or d.em_execucao_ate <= now())
     order by d.proxima_consulta_em nulls first
     limit greatest(1, least(p_limite, 50)) * 2
     for update of d skip locked
  )
  update fis_dfe_controle d set em_execucao_ate = now() + interval '4 minutes'
    from alvo, clientes c, fis_parametros pr
   where d.cliente_id = alvo.cliente_id and d.fonte = alvo.fonte and c.id = d.cliente_id and pr.cliente_id = d.cliente_id
  returning d.cliente_id, d.org_id, d.fonte, d.ult_nsu, app.fis_digitos(c.cnpj), upper(c.uf), pr.ambiente, pr.ciencia_automatica;
end $$;
revoke all on function public.fis_captura_reservar(integer, uuid) from public, anon, authenticated;
grant execute on function public.fis_captura_reservar(integer, uuid) to service_role;

-- ===================================================================================================== 7 funções da tela
/** Só dígitos. */
create or replace function app.fin_digitos(p text)
returns text language sql immutable set search_path = '' as $$ select nullif(regexp_replace(coalesce(p, ''), '\D', '', 'g'), '') $$;
revoke all on function app.fin_digitos(text) from public, anon, authenticated;

/**
 * Cria ou edita um contrato (Contratos: operar). Mesmos campos da 041 e, para contrato A RECEBER, os de faturamento:
 * documento ('nfse' | 'fatura'), envio, dia_geracao (1–28), canais (['email','whatsapp','portal']), email_envio,
 * whatsapp_envio, cliente_carteira (cadastro do cliente para o Portal), servico_descricao, servico_codigo, iss_aliquota.
 * Campo de faturamento ausente: ao editar mantém o que está gravado; ao criar usa o padrão (fatura, dia 1, sem canal).
 * Criar já lança a conta (e a fatura) do mês atual se o dia de gerar deste mês já chegou.
 */
create or replace function public.fin_recorrente_salvar(p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_id uuid := app.uuid_campo(p->>'id', 'contrato'); k fin_recorrentes; v_cliente uuid; v_org uuid; v_tipo text;
  v_hoje date; v_mes date; v_pessoa uuid; v_valor numeric := round(app.numero_campo(p->>'valor', 'valor'), 2);
  v_dia int := app.numero_campo(p->>'dia', 'dia do vencimento')::int;
  v_vig_ini date := app.data_campo(coalesce(p->>'vigencia_inicio', p->>'inicio'), 'início da vigência');
  v_vig_fim date := app.data_campo(coalesce(p->>'vigencia_fim', p->>'fim'), 'fim da vigência');
  v_renova boolean := coalesce((p->>'renovacao_automatica')::boolean, false);
  v_aviso int := coalesce(app.numero_campo(p->>'aviso_dias', 'dias de aviso')::int, 30);
  v_gera boolean := coalesce((p->>'gera_contas')::boolean, true);
  v_inicio date := date_trunc('month', v_vig_ini)::date;
  v_fim date;
  v_desde date := date_trunc('month', app.data_campo(p->>'gerar_desde', 'primeira conta'))::date;
  v_indice text := coalesce(nullif(p->>'indice', ''), 'nenhum');
  v_fixo numeric := app.numero_campo(p->>'percentual_fixo', 'percentual fixo');
  v_mes_reaj int := app.numero_campo(p->>'mes_reajuste', 'mês do reajuste')::int;
  v_geradas int := 0;
  -- faturamento (043)
  v_documento text; v_envio text; v_dia_ger int; v_canais text[]; v_email text; v_whats text; v_carteira uuid;
  v_serv_desc text; v_serv_cod text; v_iss numeric;
begin
  if v_id is not null then
    select * into k from fin_recorrentes where id = v_id for update;
    if k.id is null then raise exception 'Contrato não encontrado'; end if;
    v_cliente := k.cliente_id; v_tipo := k.tipo;
  else
    v_cliente := app.uuid_campo(p->>'cliente', 'empresa');
    v_tipo := p->>'tipo';
  end if;
  select org_id into v_org from clientes where id = v_cliente;
  if v_org is null then raise exception 'Empresa não encontrada'; end if;
  if not app.contratos_pode(v_cliente, 'operar') then
    raise exception 'Sem permissão para cadastrar contratos desta empresa (módulo Contratos)';
  end if;
  if k.id is not null and k.situacao = 'encerrado' then raise exception 'Contrato encerrado não se edita'; end if;
  if v_tipo is null or v_tipo not in ('pagar', 'receber') then raise exception 'Escolha se o contrato é a pagar ou a receber'; end if;
  if coalesce(trim(p->>'descricao'), '') = '' then raise exception 'Escreva a descrição do contrato (ex.: Aluguel da sala)'; end if;
  if v_valor is null or v_valor <= 0 then raise exception 'Informe o valor mensal (maior que zero)'; end if;
  if v_dia is null or v_dia < 1 or v_dia > 31 then raise exception 'Dia do vencimento: de 1 a 31'; end if;
  if v_inicio is null then raise exception 'Informe o início da vigência do contrato'; end if;
  if v_vig_fim is not null and v_vig_fim < v_vig_ini then raise exception 'O fim da vigência precisa ser depois do início'; end if;
  if v_renova and v_vig_fim is null then raise exception 'Renovação automática precisa da data de fim da vigência'; end if;
  if v_aviso < 0 or v_aviso > 365 then raise exception 'Aviso antes do fim: de 0 a 365 dias'; end if;
  v_fim := case when v_vig_fim is not null and not v_renova then date_trunc('month', v_vig_fim)::date end;
  if v_indice not in ('IPCA', 'IGP-M', 'INPC', 'fixo', 'nenhum') then raise exception 'Reajuste: IPCA, IGP-M, INPC, %% fixo ou sem reajuste'; end if;
  if v_indice = 'fixo' and (v_fixo is null or v_fixo <= -50 or v_fixo > 100) then
    raise exception 'Informe o percentual fixo do reajuste (de -50%% a 100%%)';
  end if;
  if v_indice <> 'nenhum' and (v_mes_reaj is null or v_mes_reaj < 1 or v_mes_reaj > 12) then
    raise exception 'Escolha o mês do reajuste';
  end if;

  -- faturamento: só contrato a receber; campo ausente mantém o gravado (editar) ou o padrão (criar)
  if v_tipo = 'receber' then
    v_documento := case when p ? 'documento' then nullif(p->>'documento', '') else coalesce(k.documento, 'fatura') end;
    v_envio := case when p ? 'envio' then nullif(p->>'envio', '') else coalesce(k.envio, 'fatura') end;
    v_dia_ger := case when p ? 'dia_geracao' then app.numero_campo(p->>'dia_geracao', 'dia de gerar')::int else coalesce(k.dia_geracao, 1) end;
    if p ? 'canais' then
      if jsonb_typeof(p->'canais') is distinct from 'array' then raise exception 'Canais de envio: escolha e-mail, WhatsApp e/ou Portal do Cliente'; end if;
      select coalesce(array_agg(distinct x order by x), '{}') into v_canais from jsonb_array_elements_text(p->'canais') x;
    else
      v_canais := coalesce(k.canais, '{}');
    end if;
    v_email := case when p ? 'email_envio' then nullif(lower(trim(p->>'email_envio')), '') else k.email_envio end;
    v_whats := case when p ? 'whatsapp_envio' then app.fin_digitos(p->>'whatsapp_envio') else k.whatsapp_envio end;
    v_carteira := case when p ? 'cliente_carteira' then app.uuid_campo(p->>'cliente_carteira', 'cliente da carteira') else k.cliente_carteira_id end;
    v_serv_desc := case when p ? 'servico_descricao' then nullif(trim(p->>'servico_descricao'), '') else k.servico_descricao end;
    v_serv_cod := case when p ? 'servico_codigo' then nullif(trim(p->>'servico_codigo'), '') else k.servico_codigo end;
    v_iss := case when p ? 'iss_aliquota' then app.numero_campo(p->>'iss_aliquota', 'alíquota do ISS') else k.iss_aliquota end;

    if v_documento is null or v_documento not in ('nfse', 'fatura') then
      raise exception 'Escolha o documento do mês: nota fiscal de serviço (NFS-e) ou só a nota fatura';
    end if;
    if v_envio is null or v_envio not in ('nf_fatura_boleto', 'nf_fatura', 'fatura_boleto', 'fatura') then
      raise exception 'Escolha o que enviar ao cliente';
    end if;
    if (v_envio in ('nf_fatura_boleto', 'nf_fatura')) <> (v_documento = 'nfse') then
      raise exception 'Com nota fiscal, envie "Nota fiscal + fatura + boleto" ou "Nota fiscal + fatura"; sem nota, "Fatura + boleto" ou "Só a fatura"';
    end if;
    if v_dia_ger is null or v_dia_ger < 1 or v_dia_ger > 28 then raise exception 'Dia de gerar: de 1 a 28 (todo mês tem esses dias)'; end if;
    if exists (select 1 from unnest(v_canais) x where x is null or x not in ('email', 'whatsapp', 'portal')) then
      raise exception 'Canal de envio desconhecido: use e-mail, WhatsApp ou Portal do Cliente';
    end if;
    if 'email' = any (v_canais) and (v_email is null or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$') then
      raise exception 'Informe o e-mail que recebe a fatura (ex.: financeiro@cliente.com.br)';
    end if;
    if v_email is not null and v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'E-mail da fatura inválido'; end if;
    if 'whatsapp' = any (v_canais) and (v_whats is null or length(v_whats) not between 10 and 13) then
      raise exception 'Informe o WhatsApp que recebe a fatura, com DDD (ex.: 11 98888-7777)';
    end if;
    if v_whats is not null and length(v_whats) not between 10 and 13 then raise exception 'WhatsApp da fatura inválido: use DDD e número'; end if;
    if v_carteira is not null and not exists (select 1 from clientes where id = v_carteira and org_id = v_org) then
      raise exception 'Cliente da carteira não encontrado nesta organização';
    end if;
    if 'portal' = any (v_canais) and v_carteira is null then
      raise exception 'Para publicar no Portal, escolha o cliente da carteira (o cadastro dele no HUB)';
    end if;
    if v_documento = 'nfse' then
      if v_serv_desc is null then raise exception 'Com nota fiscal, descreva o serviço (é o texto que vai na nota)'; end if;
      if v_serv_cod is null then raise exception 'Com nota fiscal, informe o código do serviço (ex.: 17.01.01)'; end if;
      if v_iss is null then raise exception 'Com nota fiscal, informe a alíquota do ISS (de 0%% a 5%%)'; end if;
    end if;
    if v_serv_cod is not null and v_serv_cod !~ '^[0-9]{2}\.?[0-9]{2}(\.?[0-9]{2})?$' then
      raise exception 'Código do serviço: use o código de tributação nacional (ex.: 17.01.01) ou o item da LC 116 (ex.: 17.01)';
    end if;
    if v_iss is not null and (v_iss < 0 or v_iss > 5) then raise exception 'Alíquota do ISS: de 0%% a 5%%'; end if;
  else
    v_documento := 'fatura'; v_envio := 'fatura'; v_dia_ger := 1; v_canais := '{}';
  end if;

  v_hoje := app.hoje(v_org);
  v_mes := date_trunc('month', v_hoje)::date;
  v_pessoa := app.fin_recorrente_conferir(v_cliente, v_org, v_tipo, p);

  if k.id is null then
    v_desde := coalesce(v_desde, greatest(v_mes, v_inicio));
    if v_desde < v_mes then raise exception 'A primeira conta lançada pelo HUB é a deste mês ou de um mês futuro'; end if;
    if v_desde < v_inicio then raise exception 'A primeira conta não pode ser antes do início do contrato'; end if;
    if v_fim is not null and v_fim < v_desde then raise exception 'A vigência termina antes da primeira conta: confira as datas'; end if;
    insert into fin_recorrentes (org_id, cliente_id, tipo, pessoa_id, descricao, valor, dia_vencimento, categoria_id, centro_id,
                                 conta_prevista_id, inicio, gerar_desde, fim, mes_cadastro, indice, percentual_fixo, mes_reajuste, observacao,
                                 numero, objeto, vigencia_inicio, vigencia_fim, renovacao_automatica, aviso_dias, gera_contas, por,
                                 documento, envio, dia_geracao, canais, email_envio, whatsapp_envio, cliente_carteira_id,
                                 servico_descricao, servico_codigo, iss_aliquota)
    values (v_org, v_cliente, v_tipo, v_pessoa, trim(p->>'descricao'), v_valor, v_dia, app.uuid_campo(p->>'categoria', 'categoria'),
            app.uuid_campo(p->>'centro', 'centro de custo'), app.uuid_campo(p->>'conta_prevista', 'banco previsto'),
            v_inicio, v_desde, v_fim, v_mes, v_indice, case when v_indice = 'fixo' then v_fixo end,
            case when v_indice <> 'nenhum' then v_mes_reaj end, nullif(trim(p->>'observacao'), ''),
            nullif(trim(p->>'numero'), ''), nullif(trim(p->>'objeto'), ''), v_vig_ini, v_vig_fim, v_renova, v_aviso, v_gera, auth.uid(),
            v_documento, v_envio, v_dia_ger, v_canais, v_email, v_whats, v_carteira, v_serv_desc, v_serv_cod, round(v_iss, 2))
    returning * into k;
    perform app.registrar(v_org, 'contratos', 'contrato_criar', k.id::text, null, to_jsonb(k));
    perform app.fin_recorrente_evento(k.id, 'criado', format('Contrato cadastrado: %s por mês%s', app.fin_brl(v_valor),
      case when v_gera then format(', primeira conta em %s', to_char(v_desde, 'MM/YYYY')) else ' (não lança contas)' end));
  else
    if p ? 'tipo' and p->>'tipo' is distinct from k.tipo then raise exception 'O tipo do contrato (a pagar/receber) não muda'; end if;
    if k.ultima_competencia is not null then
      v_desde := k.gerar_desde;
    else
      v_desde := coalesce(v_desde, k.gerar_desde);
      if v_desde < v_mes then raise exception 'A primeira conta lançada pelo HUB é a deste mês ou de um mês futuro'; end if;
    end if;
    if v_desde < v_inicio then raise exception 'A primeira conta não pode ser antes do início do contrato'; end if;
    if v_fim is not null and v_fim < greatest(v_desde, coalesce(k.ultima_competencia, v_desde)) then
      raise exception 'O fim da vigência não pode ser antes do último mês já lançado (%)', to_char(coalesce(k.ultima_competencia, v_desde), 'MM/YYYY');
    end if;
    update fin_recorrentes
       set pessoa_id = v_pessoa, descricao = trim(p->>'descricao'), valor = v_valor, dia_vencimento = v_dia,
           categoria_id = app.uuid_campo(p->>'categoria', 'categoria'), centro_id = app.uuid_campo(p->>'centro', 'centro de custo'),
           conta_prevista_id = app.uuid_campo(p->>'conta_prevista', 'banco previsto'), inicio = v_inicio, gerar_desde = v_desde,
           fim = v_fim, indice = v_indice, percentual_fixo = case when v_indice = 'fixo' then v_fixo end,
           mes_reajuste = case when v_indice <> 'nenhum' then v_mes_reaj end, observacao = nullif(trim(p->>'observacao'), ''),
           numero = nullif(trim(p->>'numero'), ''), objeto = nullif(trim(p->>'objeto'), ''), vigencia_inicio = v_vig_ini,
           vigencia_fim = v_vig_fim, renovacao_automatica = v_renova, aviso_dias = v_aviso, gera_contas = v_gera,
           aviso_fim_enviado = case when v_vig_fim is distinct from k.vigencia_fim then null else aviso_fim_enviado end,
           documento = v_documento, envio = v_envio, dia_geracao = v_dia_ger, canais = v_canais, email_envio = v_email,
           whatsapp_envio = v_whats, cliente_carteira_id = v_carteira, servico_descricao = v_serv_desc, servico_codigo = v_serv_cod,
           iss_aliquota = round(v_iss, 2), atualizado_em = now()
     where id = k.id;
    if v_valor <> k.valor then
      insert into fin_recorrente_reajustes (org_id, cliente_id, recorrente_id, origem, valor_antes, valor_depois, observacao, por)
      values (k.org_id, k.cliente_id, k.id, 'edicao', k.valor, v_valor, 'Valor alterado na edição do contrato', auth.uid());
      perform app.fin_recorrente_evento(k.id, 'valor', format('Valor mensal alterado na edição: %s → %s (vale para as próximas contas)',
        app.fin_brl(k.valor), app.fin_brl(v_valor)));
    end if;
    perform app.fin_recorrente_evento(k.id, 'editado', 'Dados do contrato editados');
    perform app.registrar(k.org_id, 'contratos', 'contrato_editar', k.id::text, to_jsonb(k),
      (select to_jsonb(x) from fin_recorrentes x where x.id = k.id));
  end if;

  -- a conta deste mês sai na hora se o dia de gerar já chegou (as próximas, no dia de gerar de cada mês)
  if k.situacao = 'ativo' and v_gera then v_geradas := app.fin_recorrentes_gerar(v_org, v_mes, k.id); end if;
  return jsonb_build_object('id', k.id, 'geradas', v_geradas);
end $$;
comment on function public.fin_recorrente_salvar(jsonb) is
  'Cria ou edita contrato (Contratos: operar), com o faturamento dos contratos a receber (043). Criar lança a conta do mês se o dia de gerar já chegou; editar vale para as próximas contas.';

/** Cancela a fatura com motivo (Contratos: operar). A conta do mês em aberto e sem recebimento é cancelada junto. */
create or replace function public.fin_fatura_cancelar(p_fatura uuid, p_motivo text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare f fin_faturas; t fin_titulos; v_fin text := current_setting('app.fin_interno', true); v_conta boolean := false;
begin
  select * into f from fin_faturas where id = p_fatura for update;
  if f.id is null then raise exception 'Fatura não encontrada'; end if;
  if not app.contratos_pode(f.cliente_id, 'operar') then raise exception 'Sem permissão para cancelar faturas (módulo Contratos)'; end if;
  if f.situacao = 'cancelada' then raise exception 'Esta fatura já está cancelada'; end if;
  if coalesce(trim(p_motivo), '') = '' then raise exception 'Informe o motivo do cancelamento'; end if;
  if f.nfse_situacao = 'emitida' then
    raise exception 'A nota fiscal desta fatura já foi emitida: cancele a nota no Emissor Nacional antes';
  end if;
  select * into t from fin_titulos where id = f.titulo_id for update;
  if t.valor_pago > 0 or t.situacao = 'quitado' then
    raise exception 'Esta fatura já tem recebimento no Financeiro: estorne o recebimento antes de cancelar';
  end if;
  if t.situacao = 'aberto' then
    perform set_config('app.fin_interno', '1', true);
    update fin_titulos set situacao = 'cancelado', cancelado_motivo = format('Fatura %s cancelada: %s', f.numero, trim(p_motivo)) where id = t.id;
    perform set_config('app.fin_interno', coalesce(v_fin, ''), true);
    v_conta := true;
  end if;
  update fin_faturas set situacao = 'cancelada', cancelada_em = now(), cancelada_por = auth.uid(), cancelamento_motivo = trim(p_motivo)
   where id = f.id;
  update fin_envios set situacao = 'cancelado', atualizado_em = now() where fatura_id = f.id and situacao <> 'enviado';
  perform app.registrar(f.org_id, 'contratos', 'fatura_cancelar', f.id::text, to_jsonb(f),
    jsonb_build_object('motivo', trim(p_motivo), 'conta_cancelada', v_conta));
  perform app.fin_recorrente_evento(f.recorrente_id, 'fatura', format('Fatura %s cancelada%s: %s', f.numero,
    case when v_conta then ' (conta do mês cancelada junto)' else '' end, trim(p_motivo)), jsonb_build_object('fatura', f.id));
  return jsonb_build_object('fatura', f.id, 'conta_cancelada', v_conta);
end $$;
comment on function public.fin_fatura_cancelar(uuid, text) is
  'Cancela fatura com motivo (Contratos: operar); cancela junto a conta em aberto sem recebimento; recusa se já recebida ou com NFS-e emitida (043).';

/**
 * Gera à mão a conta (e a fatura, se a receber) de um mês do contrato, com motivo (Contratos: operar). Serve para o
 * mês que a rotina não gerou (B-06), para gerar antes do dia de gerar ou de novo depois de cancelar. Não duplica: o
 * mês não pode ter conta ativa. Vale do mês de início do contrato até o mês atual (os futuros saem sozinhos).
 * p_vencimento nulo = regra do contrato.
 */
create or replace function public.fin_fatura_gerar_agora(p_contrato uuid, p_competencia date, p_motivo text, p_vencimento date default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare k fin_recorrentes; v_mes date := date_trunc('month', p_competencia)::date; v_atual date; v_existe fin_titulos; r jsonb;
begin
  select * into k from fin_recorrentes where id = p_contrato for update;
  if k.id is null then raise exception 'Contrato não encontrado'; end if;
  if not app.contratos_pode(k.cliente_id, 'operar') then raise exception 'Sem permissão para gerar faturas (módulo Contratos)'; end if;
  if k.situacao <> 'ativo' then raise exception 'Só contrato ativo gera conta e fatura'; end if;
  if not k.gera_contas then raise exception 'Este contrato não lança contas (só guarda o documento e a vigência)'; end if;
  if coalesce(trim(p_motivo), '') = '' then raise exception 'Informe o motivo (ex.: mês que a rotina não gerou)'; end if;
  if v_mes is null then raise exception 'Escolha o mês'; end if;
  v_atual := date_trunc('month', app.hoje(k.org_id))::date;
  if v_mes > v_atual then raise exception 'Só dá para gerar até o mês atual; os próximos saem sozinhos no dia de gerar'; end if;
  if v_mes < k.inicio then raise exception 'O mês escolhido é anterior ao início do contrato'; end if;
  if k.fim is not null and v_mes > k.fim then raise exception 'O mês escolhido é depois do fim do contrato'; end if;
  if p_vencimento is not null and (p_vencimento < v_mes or p_vencimento > (v_mes + interval '13 months')::date) then
    raise exception 'Vencimento fora do esperado para %', to_char(v_mes, 'MM/YYYY');
  end if;
  select * into v_existe from fin_titulos where recorrente_id = k.id and competencia = v_mes and situacao <> 'cancelado' limit 1;
  if v_existe.id is not null then
    raise exception 'O mês % já tem conta%: cancele antes para gerar de novo', to_char(v_mes, 'MM/YYYY'),
      coalesce(' (' || (select 'fatura ' || numero from fin_faturas where titulo_id = v_existe.id) || ')', '');
  end if;
  r := app.fin_recorrente_lancar_mes(k.id, v_mes, p_vencimento, trim(p_motivo));
  return r;
end $$;
comment on function public.fin_fatura_gerar_agora(uuid, date, text, date) is
  'Gera à mão, com motivo, a conta/fatura de um mês do contrato (início até o mês atual) sem duplicar (Contratos: operar) (043, B-06).';

/**
 * Portal do Cliente: faturas publicadas para o cliente (cadastro da carteira) — só as dele, só as publicadas no Portal e
 * não canceladas. Exige o login do Portal desse cliente com a permissão 'documentos'.
 */
create or replace function public.portal_minhas_faturas(p_cliente uuid)
returns table (id uuid, numero text, competencia date, emissao date, vencimento date, valor numeric, descricao text,
               documento text, nfse_situacao text, nfse_numero text, boleto_situacao text, situacao text)
language plpgsql stable security definer set search_path = public as $$
begin
  if not app.portal_pode(p_cliente, 'documentos') then raise exception 'Sem acesso às faturas deste cliente'; end if;
  return query
  select f.id, f.numero, f.competencia, f.emissao, f.vencimento, f.valor, f.descricao, f.documento, f.nfse_situacao, f.nfse_numero,
         f.boleto_situacao, f.situacao
    from fin_faturas f
   where f.cliente_carteira_id = p_cliente and f.situacao <> 'cancelada'
     and exists (select 1 from fin_envios e where e.fatura_id = f.id and e.canal = 'portal' and e.situacao = 'enviado')
   order by f.vencimento desc, f.numero desc;
end $$;
comment on function public.portal_minhas_faturas(uuid) is
  'Portal: faturas da MDC publicadas para o próprio cliente (permissão documentos); nunca as de outro cliente (043).';

-- ===================================================================================================== permissões
do $$
declare f text;
begin
  foreach f in array array['public.fin_recorrente_salvar(jsonb)', 'public.fin_fatura_cancelar(uuid, text)',
                           'public.fin_fatura_gerar_agora(uuid, date, text, date)', 'public.portal_minhas_faturas(uuid)'] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
