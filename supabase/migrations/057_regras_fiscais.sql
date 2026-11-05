-- =====================================================================================================
--  057 · Regras fiscais: uma tela só, com a regra de cada tipo de serviço amarrada ao item, ao contrato e à nota
--  (pedido do Edvaldo, 04/11/2026: "tela única e com regras juntas facilita a amarração")
--
--   1  fis_regras_servico: uma regra por tipo de serviço (código de tributação nacional da NFS-e, LC 116) da empresa
--      de gestão: nome, texto padrão na nota, NBS, ISS (%), retenção do ISS (não retém; retém em municípios
--      escolhidos; sempre) e a classificação IBS/CBS da reforma (cClassTrib e cIndOp, guardados para quando a nota
--      nacional passar a exigir). Grava só fis_regra_servico_salvar (Contratos: gerir); inativar pede motivo; nada se apaga.
--   2  app.nfse_dados (046) passa a ler a regra do código do serviço da fatura: o NBS da regra vence o NBS padrão;
--      ISS retido pela regra (sempre, ou no município do cliente) vira pendência — o HUB ainda não emite nota com ISS
--      retido (ME/EPP do Simples); emita essa pelo Emissor Nacional. Sem regra, nada muda.
--   3  Item de serviço (056) fica só com o tipo de serviço (servico_codigo): NBS e ISS moram na regra (as colunas
--      nbs e iss_aliquota de est_itens, criadas na 056 e ainda vazias, saem). est_salvar_item volta a gravar só o código.
--
--  Testes: supabase/testes/123_base_057.sql e 124_regras_fiscais_057.sql.
-- =====================================================================================================

-- ===================================================================================================== 1 regras
create table if not exists public.fis_regras_servico (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizacoes(id) on delete cascade,
  cliente_id uuid not null references public.clientes(id) on delete restrict,
  servico_codigo text not null check (servico_codigo ~ '^\d{6}$'),
  nome text not null check (length(trim(nome)) between 2 and 120),
  descricao_nota text check (descricao_nota is null or length(descricao_nota) <= 1000),
  nbs text check (nbs is null or nbs ~ '^\d{9}$'),
  iss_aliquota numeric(5, 2) check (iss_aliquota is null or (iss_aliquota >= 0 and iss_aliquota <= 5)),
  iss_retencao text not null default 'nao' check (iss_retencao in ('nao', 'municipios', 'sempre')),
  iss_retencao_municipios text[] not null default '{}',
  cclasstrib text check (cclasstrib is null or cclasstrib ~ '^\d{6}$'),
  cindop text check (cindop is null or cindop ~ '^\d{6}$'),
  ativo boolean not null default true,
  inativo_motivo text,
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid,
  check (iss_retencao <> 'municipios' or cardinality(iss_retencao_municipios) > 0),
  check (ativo or length(trim(coalesce(inativo_motivo, ''))) > 0)
);
create unique index if not exists fis_regras_servico_codigo on public.fis_regras_servico (cliente_id, servico_codigo) where ativo;
comment on table public.fis_regras_servico is
  'Regra fiscal de cada tipo de serviço (código da NFS-e/LC 116) da empresa de gestão: NBS, ISS, retenção e IBS/CBS. A nota, o contrato e o item leem daqui (057).';
alter table public.fis_regras_servico enable row level security;
drop policy if exists regras_ver on public.fis_regras_servico;
create policy regras_ver on public.fis_regras_servico for select to authenticated
  using ((select app.contratos_pode(cliente_id, 'ver')) or (select app.fin_pode(cliente_id, 'ver')));
revoke all on public.fis_regras_servico from anon;
revoke insert, update, delete, truncate on public.fis_regras_servico from authenticated;
grant select on public.fis_regras_servico to authenticated;
drop trigger if exists gestao_so_empresa on public.fis_regras_servico;
create trigger gestao_so_empresa before insert or update of cliente_id on public.fis_regras_servico
  for each row execute function app.tg_gestao_so_empresa();
drop trigger if exists cliente_mesma_org on public.fis_regras_servico;
create trigger cliente_mesma_org before insert or update of cliente_id, org_id on public.fis_regras_servico
  for each row execute function app.tg_cliente_mesma_org();
drop trigger if exists nada_se_apaga on public.fis_regras_servico;
create trigger nada_se_apaga before delete on public.fis_regras_servico
  for each row execute function app.tg_nada_se_apaga('inative a regra (com motivo)');

/** "Bragança Paulista", "SP" → "braganca paulista/SP" (sem acento, para comparar a cidade do cliente com a regra). */
create or replace function app.fis_chave_municipio(p_cidade text, p_uf text)
returns text language sql immutable set search_path = '' as $$
  select case when nullif(trim(coalesce(p_cidade, '')), '') is null or nullif(trim(coalesce(p_uf, '')), '') is null then null
    else regexp_replace(translate(lower(trim(p_cidade)), 'áàâãäéèêëíìîïóòôõöúùûüç', 'aaaaaeeeeiiiiooooouuuuc'), '\s+', ' ', 'g')
         || '/' || upper(trim(p_uf)) end
$$;
revoke all on function app.fis_chave_municipio(text, text) from public, anon, authenticated;

create or replace function public.fis_regra_servico_salvar(p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_cliente uuid := app.uuid_campo(p->>'cliente', 'empresa'); v_id uuid := app.uuid_campo(p->>'id', 'regra'); v_org uuid;
  a fis_regras_servico; n fis_regras_servico;
  v_cod text := nullif(regexp_replace(coalesce(p->>'servico_codigo', ''), '\D', '', 'g'), '');
  v_nbs text := nullif(regexp_replace(coalesce(p->>'nbs', ''), '\D', '', 'g'), '');
  v_iss numeric := app.numero_campo(p->>'iss_aliquota', 'ISS');
  v_ret text := coalesce(nullif(p->>'iss_retencao', ''), 'nao');
  v_cct text := nullif(regexp_replace(coalesce(p->>'cclasstrib', ''), '\D', '', 'g'), '');
  v_iop text := nullif(regexp_replace(coalesce(p->>'cindop', ''), '\D', '', 'g'), '');
  v_ativo boolean := coalesce((p->>'ativo')::boolean, true);
  v_motivo text := nullif(trim(coalesce(p->>'motivo', '')), '');
  v_mun text[] := '{}'; m text; v_chave text;
begin
  select org_id into v_org from clientes where id = v_cliente;
  if v_org is null then raise exception 'Empresa não encontrada'; end if;
  if not app.contratos_pode(v_cliente, 'gerir') then
    raise exception 'Sem permissão para mudar as regras fiscais (módulo Contratos, nível gerir)';
  end if;
  if v_id is not null then
    select * into a from fis_regras_servico where id = v_id and cliente_id = v_cliente for update;
    if a.id is null then raise exception 'Regra fiscal não encontrada nesta empresa'; end if;
  end if;
  if v_cod is null or length(v_cod) <> 6 then
    raise exception 'Escolha o tipo de serviço (código da NFS-e com 6 números, ex.: 17.19.01)';
  end if;
  if coalesce(length(trim(p->>'nome')), 0) < 2 then raise exception 'Dê um nome à regra (ex.: Honorários contábeis)'; end if;
  if v_nbs is not null and length(v_nbs) <> 9 then raise exception 'Código NBS: 9 números (ex.: 1.1302.10.00)'; end if;
  if v_iss is not null and (v_iss < 0 or v_iss > 5) then raise exception 'ISS: de 0%% a 5%% (teto da LC 116)'; end if;
  if v_ret not in ('nao', 'municipios', 'sempre') then raise exception 'Retenção do ISS: não retém, retém em municípios ou sempre'; end if;
  if v_cct is not null and length(v_cct) <> 6 then raise exception 'cClassTrib (IBS/CBS): 6 números'; end if;
  if v_iop is not null and length(v_iop) <> 6 then raise exception 'Indicador de operação (IBS/CBS): 6 números'; end if;
  if jsonb_typeof(p->'iss_retencao_municipios') = 'array' then
    for m in select jsonb_array_elements_text(p->'iss_retencao_municipios') loop
      v_chave := app.fis_chave_municipio(split_part(m, '/', 1), split_part(m, '/', 2));
      if v_chave is null then raise exception 'Município "%": escreva Cidade/UF (ex.: Atibaia/SP)', m; end if;
      if not v_chave = any (v_mun) then v_mun := v_mun || v_chave; end if;
    end loop;
  end if;
  if v_ret = 'municipios' and cardinality(v_mun) = 0 then
    raise exception 'Informe em quais municípios o cliente retém o ISS (Cidade/UF)';
  end if;
  if v_ret <> 'municipios' then v_mun := '{}'; end if;
  if not v_ativo and length(regexp_replace(coalesce(v_motivo, ''), '[^[:alpha:]]', '', 'g')) < 5 then
    raise exception 'Informe o motivo para inativar a regra (pelo menos 5 letras)';
  end if;
  if v_ativo and exists (select 1 from fis_regras_servico where cliente_id = v_cliente and servico_codigo = v_cod and ativo
                          and id is distinct from v_id) then
    raise exception 'Já existe uma regra ativa para o serviço %: edite a que existe', substr(v_cod, 1, 2) || '.' || substr(v_cod, 3, 2) || '.' || substr(v_cod, 5, 2);
  end if;

  if a.id is null then
    insert into fis_regras_servico (org_id, cliente_id, servico_codigo, nome, descricao_nota, nbs, iss_aliquota, iss_retencao,
                                    iss_retencao_municipios, cclasstrib, cindop, ativo, inativo_motivo, atualizado_por)
    values (v_org, v_cliente, v_cod, trim(p->>'nome'), nullif(trim(coalesce(p->>'descricao_nota', '')), ''), v_nbs, round(v_iss, 2),
            v_ret, v_mun, v_cct, v_iop, v_ativo, case when not v_ativo then v_motivo end, auth.uid())
    returning * into n;
  else
    update fis_regras_servico
       set servico_codigo = v_cod, nome = trim(p->>'nome'), descricao_nota = nullif(trim(coalesce(p->>'descricao_nota', '')), ''),
           nbs = v_nbs, iss_aliquota = round(v_iss, 2), iss_retencao = v_ret, iss_retencao_municipios = v_mun,
           cclasstrib = v_cct, cindop = v_iop, ativo = v_ativo, inativo_motivo = case when not v_ativo then v_motivo end,
           atualizado_em = now(), atualizado_por = auth.uid()
     where id = a.id returning * into n;
  end if;
  perform app.registrar(v_org, 'contratos', case when a.id is null then 'regra_fiscal_incluir' else 'regra_fiscal_alterar' end,
    n.id::text, to_jsonb(a), to_jsonb(n));
  return to_jsonb(n);
end $$;
revoke all on function public.fis_regra_servico_salvar(jsonb) from public, anon;
grant execute on function public.fis_regra_servico_salvar(jsonb) to authenticated;
comment on function public.fis_regra_servico_salvar(jsonb) is
  'Cria, edita ou inativa (com motivo) a regra fiscal de um tipo de serviço (Contratos: gerir); uma ativa por código (057).';

-- ===================================================================================================== 2 nota lê a regra
create or replace function app.nfse_dados(p_fatura uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  f fin_faturas; c jsonb; p nfse_parametros; pe fin_pessoas; v_cert record; v_pend text[] := '{}'; v_cnpj text; v_ctrib text;
  v_doc text; v_email text; v_prox bigint; v_emissoes jsonb; v_desc text; v_hoje date; r fis_regras_servico; v_nbs text;
  v_retido boolean := false; v_mun text;
begin
  select * into f from fin_faturas where id = p_fatura;
  if f.id is null then raise exception 'Fatura não encontrada'; end if;
  select to_jsonb(x) into c from clientes x where x.id = f.cliente_id;
  select * into p from nfse_parametros where cliente_id = f.cliente_id;
  select * into pe from fin_pessoas where id = f.pessoa_id;
  select valido_ate, cnpj into v_cert from fis_certificados where cliente_id = f.cliente_id;
  v_cnpj := app.fin_digitos(c->>'cnpj');
  v_ctrib := app.fin_digitos(f.servico_codigo);
  v_doc := app.fin_digitos(pe.documento);
  v_email := case when pe.email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' and length(trim(pe.email)) <= 80 then lower(trim(pe.email)) end;
  v_hoje := app.hoje(f.org_id);
  select * into r from fis_regras_servico where cliente_id = f.cliente_id and servico_codigo = v_ctrib and ativo;
  v_nbs := coalesce(r.nbs, p.nbs_padrao);
  v_mun := app.fis_chave_municipio(pe.cidade, pe.uf);
  v_retido := r.id is not null and (r.iss_retencao = 'sempre' or (r.iss_retencao = 'municipios' and v_mun = any (r.iss_retencao_municipios)));

  if f.documento <> 'nfse' then v_pend := v_pend || 'Esta fatura é só nota fatura: o contrato não emite nota fiscal'::text; end if;
  if f.situacao = 'cancelada' then v_pend := v_pend || 'Fatura cancelada não emite nota fiscal'::text; end if;
  if f.nfse_situacao = 'emitida' then
    v_pend := v_pend || format('A nota fiscal desta fatura já foi emitida (nº %s)', coalesce(f.nfse_numero, '—'));
  end if;
  if p.cliente_id is null then
    v_pend := v_pend || 'Configure a emissão em Contratos › Regras fiscais (NFS-e) — quem gere o módulo Contratos'::text;
  else
    if p.op_simples <> '3' then v_pend := v_pend || 'Por enquanto o HUB emite nota só para empresa ME/EPP do Simples Nacional'::text; end if;
    if p.p_tot_trib_sn is null then
      v_pend := v_pend || 'Informe em Regras fiscais o percentual aproximado dos tributos do Simples (vai na nota, Lei 12.741/2012)'::text;
    end if;
    if v_nbs is null then
      v_pend := v_pend || 'Informe o código NBS na regra fiscal deste serviço ou o NBS padrão em Contratos › Regras fiscais'::text;
    end if;
  end if;
  if v_cnpj is null or length(v_cnpj) <> 14 then v_pend := v_pend || 'Cadastre o CNPJ da empresa no HUB'::text; end if;
  if v_cert.valido_ate is null then
    v_pend := v_pend || 'Envie o certificado digital A1 da empresa em Entradas › Certificado digital'::text;
  elsif v_cert.valido_ate < now() then
    v_pend := v_pend || format('O certificado digital venceu em %s: envie o novo em Entradas › Certificado digital', to_char(v_cert.valido_ate, 'DD/MM/YYYY'));
  elsif v_cnpj is not null and left(app.fin_digitos(v_cert.cnpj), 8) is distinct from left(v_cnpj, 8) then
    v_pend := v_pend || 'O certificado digital guardado não é do CNPJ da empresa'::text;
  end if;
  if v_ctrib is null or length(v_ctrib) <> 6 then
    v_pend := v_pend || 'O código do serviço do contrato precisa ter 6 números (código de tributação nacional, ex.: 17.19.01): edite o contrato'::text;
  end if;
  if v_doc is null or length(v_doc) not in (11, 14) then
    v_pend := v_pend || format('Cadastre o CNPJ ou CPF do cliente "%s" em Cadastros › Fornecedores e clientes', coalesce(pe.nome, '—'));
  end if;
  if r.iss_retencao = 'municipios' and v_mun is null then
    v_pend := v_pend || format('A regra fiscal "%s" retém o ISS em alguns municípios: cadastre a cidade e a UF do cliente "%s" em Fornecedores e clientes',
                               r.nome, coalesce(pe.nome, '—'));
  end if;
  if v_retido then
    v_pend := v_pend || format('Pela regra fiscal "%s", o ISS desta nota é retido pelo cliente%s. O HUB ainda não emite nota com ISS retido: emita esta pelo Emissor Nacional',
                               r.nome, case when r.iss_retencao = 'municipios' then ' (' || coalesce(pe.cidade, '') || '/' || coalesce(pe.uf, '') || ')' else '' end);
  end if;

  v_prox := coalesce((select n.proximo from nfse_numeracao n where n.cliente_id = f.cliente_id and n.ambiente = p.ambiente and n.serie = p.serie), 1);
  select coalesce(jsonb_agg(jsonb_build_object('id', e.id, 'ambiente', e.ambiente, 'situacao', e.situacao, 'ndps', e.ndps,
           'numero_nfse', e.numero_nfse, 'chave_acesso', e.chave_acesso, 'mensagem', e.mensagem, 'mensagens', e.mensagens,
           'tentativas', e.tentativas, 'enviado_em', e.enviado_em, 'respondido_em', e.respondido_em, 'xml_caminho', e.xml_caminho)
           order by e.criado_em desc), '[]')
    into v_emissoes from (select * from nfse_emissoes where fatura_id = f.id order by criado_em desc limit 10) e;
  v_desc := f.descricao || ' · Fatura ' || f.numero || ' · Vencimento ' || to_char(f.vencimento, 'DD/MM/YYYY');

  return jsonb_build_object(
    'org', f.org_id, 'cliente', f.cliente_id,
    'fatura', jsonb_build_object('id', f.id, 'numero', f.numero, 'competencia', f.competencia, 'emissao', f.emissao,
                                 'vencimento', f.vencimento, 'valor', f.valor, 'situacao', f.situacao,
                                 'nfse_situacao', f.nfse_situacao, 'nfse_numero', f.nfse_numero),
    'pronto', coalesce(cardinality(v_pend), 0) = 0,
    'pendencias', to_jsonb(v_pend),
    'ambiente', p.ambiente, 'modo', p.modo, 'hoje', v_hoje,
    'dps', jsonb_build_object(
      'ambiente', p.ambiente, 'serie', p.serie, 'proximo_ndps', v_prox,
      'dCompet', f.competencia, 'cLocEmi', p.codigo_municipio,
      'prestador', jsonb_build_object('cnpj', v_cnpj, 'nome', coalesce(c->>'razao_social', c->>'nome'), 'im', p.inscricao_municipal,
                                      'opSimpNac', p.op_simples, 'regApTribSN', p.reg_ap_trib_sn, 'regEspTrib', p.reg_esp_trib),
      'tomador', jsonb_build_object('documento', v_doc, 'nome', pe.nome, 'email', v_email),
      'servico', jsonb_build_object('cLocPrestacao', p.codigo_municipio, 'cTribNac', v_ctrib, 'descricao', v_desc, 'cNBS', v_nbs),
      'valores', jsonb_build_object('vServ', f.valor, 'pTotTribSN', p.p_tot_trib_sn, 'tribISSQN', '1', 'tpRetISSQN', '1')),
    'iss', jsonb_build_object('aliquota_referencia', coalesce(f.iss_aliquota, r.iss_aliquota),
                              'valor_estimado', case when coalesce(f.iss_aliquota, r.iss_aliquota) is not null
                                                     then round(f.valor * coalesce(f.iss_aliquota, r.iss_aliquota) / 100, 2) end,
                              'retido', v_retido),
    'regra', case when r.id is null then null else jsonb_build_object('id', r.id, 'nome', r.nome, 'nbs', r.nbs,
                  'iss_aliquota', r.iss_aliquota, 'iss_retencao', r.iss_retencao) end,
    'emissoes', v_emissoes);
end $$;
revoke all on function app.nfse_dados(uuid) from public, anon, authenticated;

-- ===================================================================================================== 3 item só com o tipo
create or replace function public.est_salvar_item(p jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_cliente uuid := (p->>'cliente')::uuid; v_id uuid := nullif(p->>'id', '')::uuid; v_org uuid; v_antes jsonb;
  v_cod text := nullif(regexp_replace(coalesce(p->>'servico_codigo', ''), '\D', '', 'g'), '');
begin
  select org_id into v_org from clientes where id = v_cliente;
  if v_org is null then raise exception 'Empresa não encontrada'; end if;
  if not app.fin_pode(v_cliente, 'operar') then raise exception 'Sem permissão para cadastrar itens desta empresa'; end if;
  if coalesce(trim(p->>'nome'), '') = '' then raise exception 'Dê um nome ao item'; end if;
  if v_cod is not null and length(v_cod) <> 6 then
    raise exception 'Código do serviço na NFS-e: 6 números (item, subitem da LC 116 e desdobramento; ex.: 17.19.01)';
  end if;
  if v_id is not null then
    select to_jsonb(i) into v_antes from est_itens i where id = v_id and cliente_id = v_cliente;
    if v_antes is null then raise exception 'Item não encontrado nesta empresa'; end if;
  end if;
  perform set_config('app.fin_interno', '1', true);
  v_id := app.est_item_gravar(v_cliente, p, v_id, false);
  update est_itens set servico_codigo = case when tipo = 'servico' then v_cod end
   where id = v_id and servico_codigo is distinct from case when tipo = 'servico' then v_cod end;
  perform set_config('app.fin_interno', '', true);
  perform app.registrar(v_org, 'financeiro', case when v_antes is null then 'item_incluir' else 'item_alterar' end, v_id::text,
    v_antes, (select to_jsonb(i) from est_itens i where id = v_id));
  return v_id;
end $$;
revoke all on function public.est_salvar_item(jsonb) from public, anon;
grant execute on function public.est_salvar_item(jsonb) to authenticated;
comment on function public.est_salvar_item(jsonb) is
  'Cadastra ou altera um item (assistente/cadastro rápido), com grupo novo e saldo inicial na mesma transação; serviço com o tipo da LC 116 (033/056/057).';

alter table public.est_itens drop constraint if exists est_itens_fiscal_so_servico;
alter table public.est_itens drop column if exists nbs, drop column if exists iss_aliquota;
alter table public.est_itens add constraint est_itens_fiscal_so_servico check (tipo = 'servico' or servico_codigo is null);
comment on column public.est_itens.servico_codigo is
  'Serviço: código de tributação nacional da NFS-e (6 números: item, subitem da LC 116 e desdobramento). NBS, ISS e retenção estão na regra fiscal do código (fis_regras_servico, 057).';
