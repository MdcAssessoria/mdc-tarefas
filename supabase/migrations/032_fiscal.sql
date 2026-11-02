-- =====================================================================================================
--  032 · Fiscal: notas fiscais de entrada (Frente 2 do Financeiro v2, plano em docs/futuro/financeiro-v2-plano.md)
--
--  Pedido do Edvaldo (01/11/2026): certificado digital A1 do cliente para baixar as notas (e, no futuro, assinar a
--  emissão); captura automática dos XML de NF-e (Distribuição DF-e da SEFAZ) e NFS-e (Ambiente de Dados Nacional);
--  painel dos XML com manifestação do destinatário (ciência, confirmação, desconhecimento, operação não realizada),
--  prazo e protocolos; entrada no modelo do Conta Azul (tipo de entrada decide estoque, conta a pagar e categoria);
--  relatórios e carga tributária das entradas com créditos ESTIMADOS conforme o regime (regras em tabela, com vigência).
--
--  fis_parametros      por empresa: ambiente, captura ligada, ciência automática, contribuinte de ICMS/IPI
--  fis_certificados    certificado A1 por empresa (arquivo e senha no Vault, como a 013; aqui só dados públicos)
--  fis_dfe_controle    por empresa e fonte (nfe | nfse): último NSU, próxima consulta permitida, bloqueio, último erro
--  fis_notas           notas (entrada/saída) com valores, impostos, situação, manifestação, XML no Storage, origem
--  fis_nota_itens      itens da nota (com o item do estoque ligado no lançamento)
--  fis_eventos         eventos (manifestação enviada pelo HUB, cancelamento distribuído pela SEFAZ) com protocolo e XML
--  fis_depara_itens    fornecedor + código do fornecedor → item do estoque (o HUB lembra no próximo lançamento)
--  fis_tipos_entrada   regra de cada tipo de entrada (geral, da organização ou da empresa)
--  fis_regras_credito  créditos por regime, tributo e tipo de entrada, com fonte legal e vigência
--
--  Gravação só por funções security definer (search_path fixo, permissão conferida na primeira linha). A captura e a
--  manifestação rodam nas Funções Edge (fiscal-captura, fiscal-manifestar) com a chave de serviço; as funções que elas
--  chamam só aceitam service_role. A tela usa app.fin_pode (equipe com a ferramenta Financeiro ou Portal com a
--  permissão financeiro). Nada se apaga: lançamento da nota se desfaz com motivo (cancela títulos, estorna estoque).
--  Bucket privado "fiscal": <org>/<cliente>/<nfe|nfse|eventos|upload>/AAAA/MM/<arquivo>.xml.
--  Agendamento: pg_cron a cada 15 minutos chama a Função fiscal-captura com um token guardado no Vault.
-- =====================================================================================================

-- pg_net e pg_cron já foram ligados na 023 (agente da pasta de balancetes).

-- ------------------------------------------------------------------------------------- auxiliares
create or replace function app.fis_digitos(t text) returns text language sql immutable set search_path = '' as $$
  select nullif(regexp_replace(coalesce(t, ''), '\D', '', 'g'), '')
$$;
revoke all on function app.fis_digitos(text) from public, anon, authenticated;

/** Organização visível para quem pede: equipe com Financeiro (ver) ou pessoa do Portal de alguma empresa dela com financeiro. */
create or replace function app.fis_org_visivel(p_org uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select app.hub_pode(p_org, 'financeiro', 'ver')
      or exists (select 1 from portal_usuarios u where u.user_id = auth.uid() and u.org_id = p_org and u.ativo and 'financeiro' = any(u.permissoes))
$$;
revoke all on function app.fis_org_visivel(uuid) from public, anon;
grant execute on function app.fis_org_visivel(uuid) to authenticated;

/** Para as Funções Edge conferirem o acesso de quem chamou (com o login dele). */
create or replace function public.fis_pode(p_cliente uuid, p_nivel text default 'ver')
returns boolean language sql stable security definer set search_path = public as $$
  select app.fin_pode(p_cliente, p_nivel)
$$;
revoke all on function public.fis_pode(uuid, text) from public, anon;
grant execute on function public.fis_pode(uuid, text) to authenticated;

/** Quem cadastra o certificado da empresa: equipe com Financeiro (gerir) ou o próprio cliente no Portal (financeiro). */
create or replace function public.fis_pode_certificado(p_cliente uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from clientes c where c.id = p_cliente and app.hub_pode(c.org_id, 'financeiro', 'gerir'))
      or app.portal_pode(p_cliente, 'financeiro')
$$;
revoke all on function public.fis_pode_certificado(uuid) from public, anon;
grant execute on function public.fis_pode_certificado(uuid) to authenticated;

-- ------------------------------------------------------------------------------------- parâmetros por empresa
create table if not exists public.fis_parametros (
  cliente_id uuid primary key references public.clientes(id) on delete restrict,
  org_id uuid not null references public.organizacoes(id) on delete cascade,
  ambiente text not null default 'producao' check (ambiente in ('producao', 'homologacao')),
  captura_ativa boolean not null default true,
  ciencia_automatica boolean not null default true,
  contribuinte_icms boolean not null default true,
  contribuinte_ipi boolean not null default false,
  atualizado_por uuid,
  atualizado_em timestamptz not null default now()
);
comment on table public.fis_parametros is
  'Notas fiscais por empresa: ambiente (produção/homologação), captura automática, ciência automática (para receber o XML completo) e se é contribuinte de ICMS/IPI (créditos estimados).';

-- ------------------------------------------------------------------------------------- certificado A1 por empresa
create table if not exists public.fis_certificados (
  cliente_id uuid primary key references public.clientes(id) on delete restrict,
  org_id uuid not null references public.organizacoes(id) on delete cascade,
  titular text not null,
  cnpj text not null check (cnpj ~ '^\d{14}$'),
  emissor text,
  icp_brasil boolean not null default false,
  valido_de timestamptz,
  valido_ate timestamptz not null,
  pfx_secret uuid not null,
  senha_secret uuid not null,
  enviado_por uuid,
  enviado_em timestamptz not null default now()
);
comment on table public.fis_certificados is
  'Certificado A1 (e-CNPJ) de cada empresa para baixar e manifestar notas. O .pfx e a senha ficam no Vault; aqui só os dados públicos.';

-- ------------------------------------------------------------------------------------- controle da captura
create table if not exists public.fis_dfe_controle (
  cliente_id uuid not null references public.clientes(id) on delete restrict,
  fonte text not null check (fonte in ('nfe', 'nfse')),
  org_id uuid not null references public.organizacoes(id) on delete cascade,
  ult_nsu bigint not null default 0 check (ult_nsu >= 0),
  max_nsu bigint,
  proxima_consulta_em timestamptz,
  bloqueado_ate timestamptz,
  ultima_consulta_em timestamptz,
  ultimo_cstat text,
  ultimo_erro text,
  documentos_recebidos integer not null default 0,
  em_execucao_ate timestamptz,
  primary key (cliente_id, fonte)
);
comment on table public.fis_dfe_controle is
  'Captura de cada empresa: NF-e pela Distribuição DF-e (ultNSU/maxNSU; cStat 137 = esperar 1 hora; 656 = bloqueio de 1 hora) e NFS-e pelo ADN.';

-- ------------------------------------------------------------------------------------- notas
create table if not exists public.fis_notas (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizacoes(id) on delete cascade,
  cliente_id uuid not null references public.clientes(id) on delete restrict,
  direcao text not null check (direcao in ('entrada', 'saida')),
  modelo text not null check (modelo in ('55', '65', '57', 'nfse', 'outro')),
  chave text not null check (chave ~ '^\d{44,50}$'),
  conteudo text not null default 'completa' check (conteudo in ('resumo', 'completa')),
  numero text,
  serie text,
  emissao timestamptz,
  autorizacao timestamptz,
  protocolo text,
  situacao text not null default 'autorizada' check (situacao in ('autorizada', 'cancelada', 'denegada')),
  tipo_nf text,
  natureza text,
  emitente_doc text,
  emitente_nome text,
  emitente_ie text,
  emitente_uf text,
  destinatario_doc text,
  destinatario_nome text,
  valor_total numeric(15, 2) not null default 0,
  valor_produtos numeric(15, 2) not null default 0,
  valor_frete numeric(15, 2) not null default 0,
  valor_seguro numeric(15, 2) not null default 0,
  valor_desconto numeric(15, 2) not null default 0,
  valor_outros numeric(15, 2) not null default 0,
  icms_base numeric(15, 2) not null default 0,
  icms_valor numeric(15, 2) not null default 0,
  icms_st_base numeric(15, 2) not null default 0,
  icms_st_valor numeric(15, 2) not null default 0,
  ipi_valor numeric(15, 2) not null default 0,
  pis_valor numeric(15, 2) not null default 0,
  cofins_valor numeric(15, 2) not null default 0,
  iss_valor numeric(15, 2) not null default 0,
  iss_retido boolean not null default false,
  ibs_valor numeric(15, 2) not null default 0,
  cbs_valor numeric(15, 2) not null default 0,
  retencoes numeric(15, 2) not null default 0,
  cfop_principal text,
  duplicatas jsonb not null default '[]',
  manifestacao text check (manifestacao in ('ciencia', 'confirmada', 'desconhecida', 'nao_realizada')),
  manifestacao_em timestamptz,
  manifestacao_protocolo text,
  xml_caminho text,
  origem text not null check (origem in ('dfe', 'adn', 'upload')),
  nsu bigint,
  tipo_entrada text check (tipo_entrada in ('revenda', 'materia_prima', 'uso_consumo', 'imobilizado', 'servico', 'devolucao_venda', 'remessa')),
  processada boolean not null default false,
  processada_em timestamptz,
  processada_por uuid,
  data_entrada date,
  pessoa_id uuid references public.fin_pessoas(id) on delete restrict,
  titulos uuid[] not null default '{}',
  estoque_grupo uuid,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (cliente_id, chave)
);
create index if not exists fis_notas_cliente_emissao on public.fis_notas (cliente_id, emissao desc);
create index if not exists fis_notas_pendentes on public.fis_notas (cliente_id, processada) where direcao = 'entrada';
comment on table public.fis_notas is
  'Notas fiscais da empresa (NF-e, NFS-e). conteudo resumo = só o resumo da SEFAZ (antes da ciência). Lançamento (processada) gera contas a pagar e entrada de estoque. Sem exclusão (guarda pelo prazo decadencial).';

create table if not exists public.fis_nota_itens (
  id bigint generated always as identity primary key,
  nota_id uuid not null references public.fis_notas(id) on delete restrict,
  org_id uuid not null references public.organizacoes(id) on delete cascade,
  cliente_id uuid not null references public.clientes(id) on delete restrict,
  numero integer not null,
  codigo text,
  gtin text,
  descricao text not null,
  ncm text,
  cest text,
  cfop text,
  unidade text,
  quantidade numeric(15, 4) not null default 0,
  valor_unitario numeric(25, 10) not null default 0,
  valor_total numeric(15, 2) not null default 0,
  desconto numeric(15, 2) not null default 0,
  frete numeric(15, 2) not null default 0,
  seguro numeric(15, 2) not null default 0,
  outros numeric(15, 2) not null default 0,
  icms_cst text,
  icms_base numeric(15, 2) not null default 0,
  icms_aliquota numeric(7, 4) not null default 0,
  icms_valor numeric(15, 2) not null default 0,
  icms_st_valor numeric(15, 2) not null default 0,
  ipi_valor numeric(15, 2) not null default 0,
  pis_cst text,
  pis_valor numeric(15, 2) not null default 0,
  cofins_cst text,
  cofins_valor numeric(15, 2) not null default 0,
  ibs_valor numeric(15, 2) not null default 0,
  cbs_valor numeric(15, 2) not null default 0,
  item_id uuid references public.est_itens(id) on delete restrict,
  fator numeric(15, 6) not null default 1 check (fator > 0),
  unique (nota_id, numero)
);
create index if not exists fis_nota_itens_cliente_ncm on public.fis_nota_itens (cliente_id, ncm);

create table if not exists public.fis_eventos (
  id bigint generated always as identity primary key,
  org_id uuid not null references public.organizacoes(id) on delete cascade,
  cliente_id uuid not null references public.clientes(id) on delete restrict,
  nota_id uuid references public.fis_notas(id) on delete restrict,
  chave text not null,
  tp_evento text not null,
  descricao text,
  sequencia integer not null default 1,
  justificativa text,
  cstat text,
  motivo text,
  protocolo text,
  registrado_em timestamptz,
  origem text not null check (origem in ('hub', 'dfe', 'adn')),
  xml text,
  por uuid,
  em timestamptz not null default now()
);
create index if not exists fis_eventos_nota on public.fis_eventos (nota_id);
create unique index if not exists fis_eventos_protocolo on public.fis_eventos (cliente_id, chave, tp_evento, protocolo) where protocolo is not null;
comment on table public.fis_eventos is
  'Eventos das notas: manifestação enviada pelo HUB (aceita ou recusada, com cStat, protocolo e XML) e eventos distribuídos (cancelamento etc.).';

-- ------------------------------------------------------------------------------------- de-para de itens
create table if not exists public.fis_depara_itens (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizacoes(id) on delete cascade,
  cliente_id uuid not null references public.clientes(id) on delete restrict,
  fornecedor_doc text not null check (fornecedor_doc ~ '^\d{11,14}$'),
  codigo_fornecedor text not null,
  item_id uuid not null references public.est_itens(id) on delete restrict,
  fator numeric(15, 6) not null default 1 check (fator > 0),
  atualizado_em timestamptz not null default now(),
  unique (cliente_id, fornecedor_doc, codigo_fornecedor)
);
comment on table public.fis_depara_itens is
  'Código do item no fornecedor → item do estoque da empresa, com fator de unidade (ex.: caixa com 12 = fator 12). Lembrado ao lançar.';

-- ------------------------------------------------------------------------------------- tipos de entrada
create table if not exists public.fis_tipos_entrada (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references public.organizacoes(id) on delete cascade,
  cliente_id uuid references public.clientes(id) on delete restrict,
  codigo text not null check (codigo in ('revenda', 'materia_prima', 'uso_consumo', 'imobilizado', 'servico', 'devolucao_venda', 'remessa')),
  nome text not null,
  explicacao text,
  movimenta_estoque boolean not null,
  gera_pagar boolean not null,
  categoria_id uuid references public.fin_categorias(id) on delete restrict,
  ativo boolean not null default true,
  atualizado_em timestamptz not null default now(),
  check (cliente_id is null or org_id is not null),
  check (categoria_id is null or cliente_id is not null)
);
create unique index if not exists fis_tipos_entrada_geral on public.fis_tipos_entrada (codigo) where org_id is null;
create unique index if not exists fis_tipos_entrada_org on public.fis_tipos_entrada (org_id, codigo) where org_id is not null and cliente_id is null;
create unique index if not exists fis_tipos_entrada_cliente on public.fis_tipos_entrada (cliente_id, codigo) where cliente_id is not null;
comment on table public.fis_tipos_entrada is
  'Regra de cada tipo de entrada: mexe no estoque? gera conta a pagar? categoria. Vale a da empresa, senão a da organização, senão a geral (padrão MDC).';

insert into public.fis_tipos_entrada (codigo, nome, explicacao, movimenta_estoque, gera_pagar) values
  ('revenda', 'Compra para revenda', 'Mercadoria comprada para vender do jeito que veio.', true, true),
  ('materia_prima', 'Matéria-prima / industrialização', 'Insumo transformado ou usado na produção.', true, true),
  ('uso_consumo', 'Uso e consumo', 'Material que a empresa usa e não vende (escritório, limpeza, manutenção).', false, true),
  ('imobilizado', 'Ativo imobilizado', 'Bem durável da empresa (máquina, veículo, computador, móvel).', false, true),
  ('servico', 'Serviço tomado', 'Serviço contratado de outra empresa (nota de serviço).', false, true),
  ('devolucao_venda', 'Devolução de venda', 'Mercadoria vendida que o cliente devolveu.', true, false),
  ('remessa', 'Remessa, retorno ou bonificação', 'Mercadoria que chegou sem compra (conserto, demonstração, consignação, brinde).', false, false)
on conflict do nothing;

-- ------------------------------------------------------------------------------------- regras de crédito
create table if not exists public.fis_regras_credito (
  id bigint generated always as identity primary key,
  org_id uuid references public.organizacoes(id) on delete cascade,
  regime text not null check (regime in ('simples', 'presumido', 'real', 'mei', 'imune_isenta', 'pf', 'outro')),
  tributo text not null check (tributo in ('icms', 'icms_st', 'ipi', 'pis', 'cofins', 'iss', 'ibs', 'cbs')),
  forma text not null check (forma in ('nenhum', 'destacado', 'aliquota')),
  aliquota numeric(7, 4) check (aliquota is null or aliquota >= 0),
  base text check (base in ('item', 'item_sem_icms')),
  tipos_entrada text[],
  condicao text check (condicao in ('contribuinte_icms', 'contribuinte_ipi')),
  cst_sem_credito text[],
  explicacao text not null,
  fonte_legal text not null,
  vigencia_inicio date not null,
  vigencia_fim date,
  criado_em timestamptz not null default now(),
  check (forma <> 'aliquota' or (aliquota is not null and base is not null)),
  check (vigencia_fim is null or vigencia_fim >= vigencia_inicio)
);
comment on table public.fis_regras_credito is
  'Créditos estimados das entradas por regime e tributo, com fonte legal e vigência. Lei nova = linha nova (a antiga ganha fim de vigência). org_id preenchido = regra própria da organização (tem preferência).';

insert into public.fis_regras_credito (regime, tributo, forma, aliquota, base, tipos_entrada, condicao, cst_sem_credito, explicacao, fonte_legal, vigencia_inicio, vigencia_fim) values
  ('simples', 'icms', 'nenhum', null, null, null, null, null,
   'Empresa do Simples não aproveita crédito de ICMS das compras (paga o imposto dentro do DAS).', 'LC 123/2006, art. 23', '2007-07-01', null),
  ('simples', 'ipi', 'nenhum', null, null, null, null, null,
   'Empresa do Simples não aproveita crédito de IPI das compras.', 'LC 123/2006, art. 23', '2007-07-01', null),
  ('simples', 'pis', 'nenhum', null, null, null, null, null,
   'Empresa do Simples não aproveita crédito de PIS das compras.', 'LC 123/2006, art. 23', '2007-07-01', null),
  ('simples', 'cofins', 'nenhum', null, null, null, null, null,
   'Empresa do Simples não aproveita crédito de COFINS das compras.', 'LC 123/2006, art. 23', '2007-07-01', null),
  ('presumido', 'pis', 'nenhum', null, null, null, null, null,
   'No Lucro Presumido o PIS é cumulativo (0,65% sobre a receita): as compras não geram crédito.', 'Lei 9.718/1998, arts. 2º e 3º; Lei 10.637/2002, art. 8º, II', '2002-12-01', null),
  ('presumido', 'cofins', 'nenhum', null, null, null, null, null,
   'No Lucro Presumido a COFINS é cumulativa (3% sobre a receita): as compras não geram crédito.', 'Lei 9.718/1998, arts. 2º e 3º; Lei 10.833/2003, art. 10, II', '2004-02-01', null),
  ('presumido', 'icms', 'destacado', null, null, array['revenda', 'materia_prima', 'devolucao_venda'], 'contribuinte_icms', null,
   'ICMS destacado nas compras para revenda ou produção vira crédito para quem é contribuinte do ICMS (uso e consumo só a partir de 2033; imobilizado em 1/48 avos pelo CIAP, fora desta estimativa).',
   'LC 87/1996, arts. 19, 20 e 33', '1996-11-01', null),
  ('presumido', 'ipi', 'destacado', null, null, array['materia_prima'], 'contribuinte_ipi', null,
   'IPI destacado na compra de matéria-prima, produto intermediário e embalagem vira crédito para o estabelecimento industrial.',
   'Decreto 7.212/2010 (RIPI), art. 226', '2010-06-16', null),
  ('real', 'icms', 'destacado', null, null, array['revenda', 'materia_prima', 'devolucao_venda'], 'contribuinte_icms', null,
   'ICMS destacado nas compras para revenda ou produção vira crédito para quem é contribuinte do ICMS (uso e consumo só a partir de 2033; imobilizado em 1/48 avos pelo CIAP, fora desta estimativa).',
   'LC 87/1996, arts. 19, 20 e 33', '1996-11-01', null),
  ('real', 'ipi', 'destacado', null, null, array['materia_prima'], 'contribuinte_ipi', null,
   'IPI destacado na compra de matéria-prima, produto intermediário e embalagem vira crédito para o estabelecimento industrial.',
   'Decreto 7.212/2010 (RIPI), art. 226', '2010-06-16', null),
  ('real', 'pis', 'aliquota', 1.65, 'item', array['revenda', 'materia_prima', 'servico', 'devolucao_venda'], null,
   array['04', '05', '06', '07', '08', '09'],
   'Lucro Real: PIS não cumulativo — crédito de 1,65% sobre compras para revenda, insumos e devoluções de venda (compra sem PIS, como monofásico ou alíquota zero, não gera crédito).',
   'Lei 10.637/2002, arts. 2º e 3º, I, II e VIII, e §2º, II', '2002-12-01', '2023-05-29'),
  ('real', 'pis', 'aliquota', 1.65, 'item_sem_icms', array['revenda', 'materia_prima', 'servico', 'devolucao_venda'], null,
   array['04', '05', '06', '07', '08', '09'],
   'Lucro Real: PIS não cumulativo — crédito de 1,65% sobre compras para revenda, insumos e devoluções de venda, sem o ICMS destacado na base (compra sem PIS não gera crédito).',
   'Lei 10.637/2002, art. 3º, §2º, III (incluído pela Lei 14.592/2023)', '2023-05-30', null),
  ('real', 'cofins', 'aliquota', 7.6, 'item', array['revenda', 'materia_prima', 'servico', 'devolucao_venda'], null,
   array['04', '05', '06', '07', '08', '09'],
   'Lucro Real: COFINS não cumulativa — crédito de 7,6% sobre compras para revenda, insumos e devoluções de venda (compra sem COFINS não gera crédito).',
   'Lei 10.833/2003, arts. 2º e 3º, I, II e VIII, e §2º, II', '2004-02-01', '2023-05-29'),
  ('real', 'cofins', 'aliquota', 7.6, 'item_sem_icms', array['revenda', 'materia_prima', 'servico', 'devolucao_venda'], null,
   array['04', '05', '06', '07', '08', '09'],
   'Lucro Real: COFINS não cumulativa — crédito de 7,6% sobre compras para revenda, insumos e devoluções de venda, sem o ICMS destacado na base.',
   'Lei 10.833/2003, art. 3º, §2º, III (incluído pela Lei 14.592/2023)', '2023-05-30', null),
  ('simples', 'ibs', 'nenhum', null, null, null, null, null,
   '2026: IBS e CBS destacados só para informação (ano de teste da reforma); não há crédito a aproveitar nas compras.', 'LC 214/2025, arts. 343 a 348', '2026-01-01', '2026-12-31'),
  ('presumido', 'ibs', 'nenhum', null, null, null, null, null,
   '2026: IBS e CBS destacados só para informação (ano de teste da reforma); não há crédito a aproveitar nas compras.', 'LC 214/2025, arts. 343 a 348', '2026-01-01', '2026-12-31'),
  ('real', 'ibs', 'nenhum', null, null, null, null, null,
   '2026: IBS e CBS destacados só para informação (ano de teste da reforma); não há crédito a aproveitar nas compras.', 'LC 214/2025, arts. 343 a 348', '2026-01-01', '2026-12-31');

-- ------------------------------------------------------------------------------------- mesma organização, sem troca de empresa, auditoria
do $$
declare t text;
begin
  foreach t in array array['fis_parametros', 'fis_certificados', 'fis_dfe_controle', 'fis_notas', 'fis_nota_itens', 'fis_eventos', 'fis_depara_itens'] loop
    execute format('drop trigger if exists cliente_mesma_org on public.%I', t);
    execute format('create trigger cliente_mesma_org before insert or update of cliente_id, org_id on public.%I
                    for each row execute function app.tg_cliente_mesma_org()', t);
    execute format('drop trigger if exists sem_troca_empresa on public.%I', t);
    execute format('create trigger sem_troca_empresa before update of cliente_id, org_id on public.%I
                    for each row execute function app.tg_fin_sem_troca_empresa()', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists fis_ver on public.%I', t);
    execute format('create policy fis_ver on public.%I for select to authenticated using (app.fin_pode(cliente_id, ''ver''))', t);
  end loop;
end $$;

-- de-para: a pessoa ajusta direto (operar); fica na auditoria
drop trigger if exists fin_auditar on public.fis_depara_itens;
create trigger fin_auditar after insert or update on public.fis_depara_itens for each row execute function app.tg_fin_auditar();
drop policy if exists fis_incluir on public.fis_depara_itens;
create policy fis_incluir on public.fis_depara_itens for insert to authenticated with check (app.fin_pode(cliente_id, 'operar'));
drop policy if exists fis_alterar on public.fis_depara_itens;
create policy fis_alterar on public.fis_depara_itens for update to authenticated
  using (app.fin_pode(cliente_id, 'operar')) with check (app.fin_pode(cliente_id, 'operar'));

/** De-para: o item do estoque é da mesma empresa. */
create or replace function app.tg_fis_depara()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from est_itens where id = new.item_id and cliente_id = new.cliente_id) then
    raise exception 'O item escolhido não é desta empresa';
  end if;
  new.atualizado_em := now();
  return new;
end $$;
revoke all on function app.tg_fis_depara() from public, anon, authenticated;
drop trigger if exists fis_depara_valida on public.fis_depara_itens;
create trigger fis_depara_valida before insert or update on public.fis_depara_itens for each row execute function app.tg_fis_depara();

alter table public.fis_tipos_entrada enable row level security;
drop policy if exists fis_ver on public.fis_tipos_entrada;
create policy fis_ver on public.fis_tipos_entrada for select to authenticated
  using (org_id is null or (cliente_id is null and app.fis_org_visivel(org_id)) or (cliente_id is not null and app.fin_pode(cliente_id, 'ver')));
alter table public.fis_regras_credito enable row level security;
drop policy if exists fis_ver on public.fis_regras_credito;
create policy fis_ver on public.fis_regras_credito for select to authenticated using (org_id is null or app.fis_org_visivel(org_id));

-- tabelas gravadas só pelas funções (sem política de gravação; revoga por garantia)
revoke insert, update, delete on public.fis_parametros, public.fis_certificados, public.fis_dfe_controle, public.fis_notas,
  public.fis_nota_itens, public.fis_eventos, public.fis_tipos_entrada, public.fis_regras_credito from authenticated;
revoke all on public.fis_parametros, public.fis_certificados, public.fis_dfe_controle, public.fis_notas, public.fis_nota_itens,
  public.fis_eventos, public.fis_depara_itens, public.fis_tipos_entrada, public.fis_regras_credito from anon;
revoke delete on public.fis_depara_itens from authenticated;

-- títulos gerados por nota apontam para ela (navegação de volta)
alter table public.fin_titulos add column if not exists nota_id uuid references public.fis_notas(id) on delete restrict;
create index if not exists fin_titulos_nota on public.fin_titulos (nota_id) where nota_id is not null;

-- ------------------------------------------------------------------------------------- parâmetros (tela)
/** Equipe com Financeiro (operar) muda os parâmetros de notas da empresa. */
create or replace function public.fis_salvar_parametros(p_cliente uuid, p jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare v_org uuid; v_antes jsonb;
begin
  select org_id into v_org from clientes where id = p_cliente;
  if v_org is null then raise exception 'Empresa não encontrada'; end if;
  if not app.hub_pode(v_org, 'financeiro', 'operar') then raise exception 'Só a equipe MDC muda os parâmetros de notas fiscais'; end if;
  if coalesce(p->>'ambiente', 'producao') not in ('producao', 'homologacao') then raise exception 'Ambiente inválido'; end if;
  select to_jsonb(x) into v_antes from fis_parametros x where cliente_id = p_cliente;
  insert into fis_parametros (cliente_id, org_id, ambiente, captura_ativa, ciencia_automatica, contribuinte_icms, contribuinte_ipi, atualizado_por)
  values (p_cliente, v_org, coalesce(p->>'ambiente', 'producao'), coalesce((p->>'captura_ativa')::boolean, true),
          coalesce((p->>'ciencia_automatica')::boolean, true), coalesce((p->>'contribuinte_icms')::boolean, true),
          coalesce((p->>'contribuinte_ipi')::boolean, false), auth.uid())
  on conflict (cliente_id) do update set
    ambiente = coalesce(p->>'ambiente', fis_parametros.ambiente),
    captura_ativa = coalesce((p->>'captura_ativa')::boolean, fis_parametros.captura_ativa),
    ciencia_automatica = coalesce((p->>'ciencia_automatica')::boolean, fis_parametros.ciencia_automatica),
    contribuinte_icms = coalesce((p->>'contribuinte_icms')::boolean, fis_parametros.contribuinte_icms),
    contribuinte_ipi = coalesce((p->>'contribuinte_ipi')::boolean, fis_parametros.contribuinte_ipi),
    atualizado_por = auth.uid(), atualizado_em = now();
  perform app.registrar(v_org, 'financeiro', 'notas_parametros', p_cliente::text, v_antes, p);
end $$;
revoke all on function public.fis_salvar_parametros(uuid, jsonb) from public, anon;
grant execute on function public.fis_salvar_parametros(uuid, jsonb) to authenticated;

/** Regra de tipo de entrada da organização (cliente nulo) ou da empresa (com categoria). Equipe com Financeiro (gerir). */
create or replace function public.fis_salvar_tipo_entrada(p jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_cliente uuid := nullif(p->>'cliente', '')::uuid; v_org uuid := nullif(p->>'org', '')::uuid; v_cod text := p->>'codigo';
  v_geral fis_tipos_entrada; v_id uuid; v_cat uuid := nullif(p->>'categoria', '')::uuid;
begin
  if v_cliente is not null then select org_id into v_org from clientes where id = v_cliente; end if;
  if v_org is null then raise exception 'Organização não encontrada'; end if;
  if not app.hub_pode(v_org, 'financeiro', 'gerir') then raise exception 'Só a equipe MDC (gerir) muda as regras dos tipos de entrada'; end if;
  select * into v_geral from fis_tipos_entrada where org_id is null and codigo = v_cod;
  if v_geral.id is null then raise exception 'Tipo de entrada inválido'; end if;
  if v_cat is not null then
    if v_cliente is null then raise exception 'A categoria é escolhida por empresa'; end if;
    if not exists (select 1 from fin_categorias where id = v_cat and cliente_id = v_cliente and tipo = 'despesa' and ativo) then
      raise exception 'A categoria precisa ser uma despesa ativa desta empresa';
    end if;
  end if;
  if v_cliente is null then
    select id into v_id from fis_tipos_entrada where org_id = v_org and cliente_id is null and codigo = v_cod;
  else
    select id into v_id from fis_tipos_entrada where cliente_id = v_cliente and codigo = v_cod;
  end if;
  if v_id is null then
    insert into fis_tipos_entrada (org_id, cliente_id, codigo, nome, explicacao, movimenta_estoque, gera_pagar, categoria_id)
    values (v_org, v_cliente, v_cod, v_geral.nome, v_geral.explicacao,
            coalesce((p->>'movimenta_estoque')::boolean, v_geral.movimenta_estoque), coalesce((p->>'gera_pagar')::boolean, v_geral.gera_pagar), v_cat)
    returning id into v_id;
  else
    update fis_tipos_entrada set movimenta_estoque = coalesce((p->>'movimenta_estoque')::boolean, movimenta_estoque),
           gera_pagar = coalesce((p->>'gera_pagar')::boolean, gera_pagar), categoria_id = v_cat, atualizado_em = now()
     where id = v_id;
  end if;
  perform app.registrar(v_org, 'financeiro', 'notas_tipo_entrada', v_cod, null, p);
  return v_id;
end $$;
revoke all on function public.fis_salvar_tipo_entrada(jsonb) from public, anon;
grant execute on function public.fis_salvar_tipo_entrada(jsonb) to authenticated;

/** Regra que vale para a empresa: a da empresa, senão a da organização, senão a geral. */
create or replace function app.fis_tipo_efetivo(p_cliente uuid, p_codigo text)
returns table (movimenta_estoque boolean, gera_pagar boolean, categoria_id uuid)
language sql stable security definer set search_path = public as $$
  select t.movimenta_estoque, t.gera_pagar,
         (select categoria_id from fis_tipos_entrada where cliente_id = p_cliente and codigo = p_codigo and ativo)
    from fis_tipos_entrada t
   where t.codigo = p_codigo and t.ativo
     and (t.cliente_id = p_cliente
          or (t.cliente_id is null and t.org_id = (select org_id from clientes where id = p_cliente))
          or t.org_id is null)
   order by (t.cliente_id is not null) desc, (t.org_id is not null) desc
   limit 1
$$;
revoke all on function app.fis_tipo_efetivo(uuid, text) from public, anon, authenticated;

-- ------------------------------------------------------------------------------------- certificado (só as Funções Edge)
create or replace function public.fis_cert_salvar(p_cliente uuid, p_user uuid, p_pfx text, p_senha text, p_info jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare v public.fis_certificados; v_org uuid; v_nome text;
begin
  select c.org_id, coalesce(c.nome_fantasia, c.razao_social) into v_org, v_nome from public.clientes c where c.id = p_cliente;
  if v_org is null then raise exception 'Empresa não encontrada'; end if;
  select * into v from public.fis_certificados where cliente_id = p_cliente;
  if found then
    perform vault.update_secret(v.pfx_secret, p_pfx);
    perform vault.update_secret(v.senha_secret, p_senha);
    update public.fis_certificados set
      titular = p_info->>'titular', cnpj = p_info->>'cnpj', emissor = p_info->>'emissor',
      icp_brasil = coalesce((p_info->>'icp_brasil')::boolean, false),
      valido_de = (p_info->>'valido_de')::timestamptz, valido_ate = (p_info->>'valido_ate')::timestamptz,
      enviado_por = p_user, enviado_em = now()
    where cliente_id = p_cliente;
  else
    delete from vault.secrets where name in ('fis_pfx_' || p_cliente, 'fis_senha_' || p_cliente);
    insert into public.fis_certificados (cliente_id, org_id, titular, cnpj, emissor, icp_brasil, valido_de, valido_ate, pfx_secret, senha_secret, enviado_por)
    values (p_cliente, v_org, p_info->>'titular', p_info->>'cnpj', p_info->>'emissor', coalesce((p_info->>'icp_brasil')::boolean, false),
            (p_info->>'valido_de')::timestamptz, (p_info->>'valido_ate')::timestamptz,
            vault.create_secret(p_pfx, 'fis_pfx_' || p_cliente, 'Certificado A1 (base64) da empresa para notas fiscais'),
            vault.create_secret(p_senha, 'fis_senha_' || p_cliente, 'Senha do certificado A1 da empresa (notas fiscais)'),
            p_user);
  end if;
  insert into public.fis_parametros (cliente_id, org_id) values (p_cliente, v_org) on conflict (cliente_id) do nothing;
  insert into public.fis_dfe_controle (cliente_id, fonte, org_id) values (p_cliente, 'nfe', v_org), (p_cliente, 'nfse', v_org)
  on conflict (cliente_id, fonte) do nothing;
  -- vencimento no módulo Vencimentos (avisos aos 60, 30, 7 dias), visível ao cliente
  update public.venc_itens set status = 'encerrado'
   where cliente_id = p_cliente and tipo = 'certificado_a1' and descricao like 'Notas fiscais%' and status = 'ativo';
  insert into public.venc_itens (org_id, cliente_id, tipo, descricao, vence_em, responsavel_id, visivel_cliente, criado_por)
  values (v_org, p_cliente, 'certificado_a1', 'Notas fiscais — certificado A1 de ' || coalesce(p_info->>'titular', v_nome),
          ((p_info->>'valido_ate')::timestamptz at time zone 'America/Sao_Paulo')::date, p_user, true, p_user);
  insert into public.hub_auditoria (org_id, user_id, app, acao, alvo, depois)
  values (v_org, p_user, 'financeiro', 'notas_certificado_cadastrado', p_cliente::text,
          jsonb_build_object('titular', p_info->>'titular', 'emissor', p_info->>'emissor', 'valido_ate', p_info->>'valido_ate'));
end $$;

create or replace function public.fis_cert_obter(p_cliente uuid)
returns table (pfx text, senha text, cnpj text, titular text, valido_ate timestamptz)
language sql security definer set search_path = '' as $$
  select p.decrypted_secret, s.decrypted_secret, c.cnpj, c.titular, c.valido_ate
    from public.fis_certificados c
    join vault.decrypted_secrets p on p.id = c.pfx_secret
    join vault.decrypted_secrets s on s.id = c.senha_secret
   where c.cliente_id = p_cliente
$$;

create or replace function public.fis_cert_remover(p_cliente uuid, p_user uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_org uuid;
begin
  select org_id into v_org from public.fis_certificados where cliente_id = p_cliente;
  if v_org is null then return; end if;
  delete from vault.secrets where id in (select pfx_secret from public.fis_certificados where cliente_id = p_cliente
                                         union select senha_secret from public.fis_certificados where cliente_id = p_cliente);
  delete from public.fis_certificados where cliente_id = p_cliente;
  update public.venc_itens set status = 'encerrado'
   where cliente_id = p_cliente and tipo = 'certificado_a1' and descricao like 'Notas fiscais%' and status = 'ativo';
  insert into public.hub_auditoria (org_id, user_id, app, acao, alvo) values (v_org, p_user, 'financeiro', 'notas_certificado_removido', p_cliente::text);
end $$;

revoke execute on function public.fis_cert_salvar(uuid, uuid, text, text, jsonb) from public, anon, authenticated;
revoke execute on function public.fis_cert_obter(uuid) from public, anon, authenticated;
revoke execute on function public.fis_cert_remover(uuid, uuid) from public, anon, authenticated;
grant execute on function public.fis_cert_salvar(uuid, uuid, text, text, jsonb) to service_role;
grant execute on function public.fis_cert_obter(uuid) to service_role;
grant execute on function public.fis_cert_remover(uuid, uuid) to service_role;

-- ------------------------------------------------------------------------------------- gravar nota e evento (interno)
/** Direção da nota para a empresa (mesma regra de documentos.ts › direcaoParaEmpresa). */
create or replace function app.fis_direcao(p_nota jsonb, p_cnpj text)
returns text language sql immutable set search_path = '' as $$
  select case
    when app.fis_digitos(p_nota->>'emitente_doc') is distinct from app.fis_digitos(p_cnpj) then 'entrada'
    when p_nota->>'modelo' <> 'nfse' and p_nota->>'tipo_nf' = '0' then 'entrada'
    else 'saida' end
$$;
revoke all on function app.fis_direcao(jsonb, text) from public, anon, authenticated;

/**
 * Grava (ou completa) uma nota a partir do JSON lido do XML (campos de NotaLida, documentos.ts). Resumo que vira
 * completa recebe os itens e o XML; nota que já está completa só ganha o caminho do XML se faltava; o resumo de uma
 * nota que já existe só atualiza a situação (cancelada/denegada).
 */
create or replace function app.fis_gravar_nota(p_cliente uuid, p_origem text, p_nota jsonb, p_caminho text, p_nsu bigint)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  c clientes; v fis_notas; v_id uuid; v_chave text := app.fis_digitos(p_nota->>'chave'); v_conteudo text := coalesce(p_nota->>'conteudo', 'completa');
  i jsonb; n int := 0;
begin
  select * into c from clientes where id = p_cliente;
  if c.id is null then raise exception 'Empresa não encontrada'; end if;
  if v_chave is null or length(v_chave) not between 44 and 50 then raise exception 'Chave de acesso inválida'; end if;
  perform pg_advisory_xact_lock(hashtext(p_cliente::text || v_chave));
  select * into v from fis_notas where cliente_id = p_cliente and chave = v_chave for update;

  if v.id is not null then
    if v.conteudo = 'resumo' and v_conteudo = 'completa' then
      delete from fis_nota_itens where nota_id = v.id; -- resumo não tem itens; garante gravação limpa
    else
      update fis_notas set
        situacao = case when p_nota->>'situacao' in ('cancelada', 'denegada') then p_nota->>'situacao' else situacao end,
        xml_caminho = coalesce(xml_caminho, p_caminho), atualizado_em = now()
       where id = v.id;
      return v.id;
    end if;
  end if;

  if v.id is null then
    insert into fis_notas (org_id, cliente_id, direcao, modelo, chave, conteudo, origem, nsu)
    values (c.org_id, p_cliente, app.fis_direcao(p_nota, c.cnpj), coalesce(p_nota->>'modelo', 'outro'), v_chave, v_conteudo, p_origem, p_nsu)
    returning id into v_id;
  else
    v_id := v.id;
  end if;

  update fis_notas set
    conteudo = v_conteudo, numero = p_nota->>'numero', serie = p_nota->>'serie',
    emissao = nullif(p_nota->>'emissao', '')::timestamptz, autorizacao = nullif(p_nota->>'autorizacao', '')::timestamptz,
    protocolo = p_nota->>'protocolo',
    situacao = case when situacao = 'cancelada' then 'cancelada' else coalesce(p_nota->>'situacao', 'autorizada') end,
    tipo_nf = p_nota->>'tipo_nf', natureza = p_nota->>'natureza',
    emitente_doc = app.fis_digitos(p_nota->>'emitente_doc'), emitente_nome = p_nota->>'emitente_nome',
    emitente_ie = p_nota->>'emitente_ie', emitente_uf = p_nota->>'emitente_uf',
    destinatario_doc = app.fis_digitos(p_nota->>'destinatario_doc'), destinatario_nome = p_nota->>'destinatario_nome',
    valor_total = coalesce((p_nota->>'valor_total')::numeric, 0), valor_produtos = coalesce((p_nota->>'valor_produtos')::numeric, 0),
    valor_frete = coalesce((p_nota->>'valor_frete')::numeric, 0), valor_seguro = coalesce((p_nota->>'valor_seguro')::numeric, 0),
    valor_desconto = coalesce((p_nota->>'valor_desconto')::numeric, 0), valor_outros = coalesce((p_nota->>'valor_outros')::numeric, 0),
    icms_base = coalesce((p_nota->>'icms_base')::numeric, 0), icms_valor = coalesce((p_nota->>'icms_valor')::numeric, 0),
    icms_st_base = coalesce((p_nota->>'icms_st_base')::numeric, 0), icms_st_valor = coalesce((p_nota->>'icms_st_valor')::numeric, 0),
    ipi_valor = coalesce((p_nota->>'ipi_valor')::numeric, 0), pis_valor = coalesce((p_nota->>'pis_valor')::numeric, 0),
    cofins_valor = coalesce((p_nota->>'cofins_valor')::numeric, 0), iss_valor = coalesce((p_nota->>'iss_valor')::numeric, 0),
    iss_retido = coalesce((p_nota->>'iss_retido')::boolean, false), ibs_valor = coalesce((p_nota->>'ibs_valor')::numeric, 0),
    cbs_valor = coalesce((p_nota->>'cbs_valor')::numeric, 0), retencoes = coalesce((p_nota->>'retencoes')::numeric, 0),
    cfop_principal = p_nota->>'cfop_principal', duplicatas = coalesce(p_nota->'duplicatas', '[]'),
    xml_caminho = coalesce(p_caminho, xml_caminho), nsu = coalesce(nsu, p_nsu), atualizado_em = now()
   where id = v_id;

  for i in select * from jsonb_array_elements(coalesce(p_nota->'itens', '[]')) loop
    n := n + 1;
    insert into fis_nota_itens (nota_id, org_id, cliente_id, numero, codigo, gtin, descricao, ncm, cest, cfop, unidade, quantidade,
      valor_unitario, valor_total, desconto, frete, seguro, outros, icms_cst, icms_base, icms_aliquota, icms_valor, icms_st_valor,
      ipi_valor, pis_cst, pis_valor, cofins_cst, cofins_valor, ibs_valor, cbs_valor)
    values (v_id, c.org_id, p_cliente, coalesce(nullif(i->>'numero', '')::int, n), i->>'codigo', i->>'gtin',
      coalesce(nullif(trim(i->>'descricao'), ''), '(sem descrição)'), i->>'ncm', i->>'cest', i->>'cfop', i->>'unidade',
      coalesce((i->>'quantidade')::numeric, 0), coalesce((i->>'valor_unitario')::numeric, 0), coalesce((i->>'valor_total')::numeric, 0),
      coalesce((i->>'desconto')::numeric, 0), coalesce((i->>'frete')::numeric, 0), coalesce((i->>'seguro')::numeric, 0),
      coalesce((i->>'outros')::numeric, 0), i->>'icms_cst', coalesce((i->>'icms_base')::numeric, 0),
      coalesce((i->>'icms_aliquota')::numeric, 0), coalesce((i->>'icms_valor')::numeric, 0), coalesce((i->>'icms_st_valor')::numeric, 0),
      coalesce((i->>'ipi_valor')::numeric, 0), i->>'pis_cst', coalesce((i->>'pis_valor')::numeric, 0), i->>'cofins_cst',
      coalesce((i->>'cofins_valor')::numeric, 0), coalesce((i->>'ibs_valor')::numeric, 0), coalesce((i->>'cbs_valor')::numeric, 0));
  end loop;

  -- evento que chegou antes da nota (cancelamento, manifestação) passa a valer agora
  update fis_eventos set nota_id = v_id where cliente_id = p_cliente and chave = v_chave and nota_id is null;
  if exists (select 1 from fis_eventos where nota_id = v_id and tp_evento in ('110111', '110112')) then
    update fis_notas set situacao = 'cancelada' where id = v_id;
  end if;
  return v_id;
end $$;
revoke all on function app.fis_gravar_nota(uuid, text, jsonb, text, bigint) from public, anon, authenticated;

/** Código da manifestação pelo tipo de evento da SEFAZ. */
create or replace function app.fis_manifestacao_do_tipo(p_tp text) returns text language sql immutable set search_path = '' as $$
  select case p_tp when '210210' then 'ciencia' when '210200' then 'confirmada' when '210220' then 'desconhecida'
                   when '210240' then 'nao_realizada' end
$$;
revoke all on function app.fis_manifestacao_do_tipo(text) from public, anon, authenticated;

/**
 * Grava um evento. Evento aceito (135/136/155, ou distribuído com protocolo) atualiza a nota: cancelamento (110111/110112)
 * marca cancelada; manifestação muda a situação (a ciência não apaga uma manifestação conclusiva já feita).
 */
create or replace function app.fis_gravar_evento(p_cliente uuid, p_origem text, p_ev jsonb, p_xml text, p_por uuid)
returns bigint language plpgsql security definer set search_path = public as $$
declare
  v_org uuid; v_chave text := app.fis_digitos(p_ev->>'chave'); v_tp text := p_ev->>'tpEvento'; v_nota uuid; v_id bigint;
  v_cstat text := p_ev->>'cStat'; v_prot text := nullif(p_ev->>'protocolo', ''); v_aceito boolean; v_man text;
begin
  select org_id into v_org from clientes where id = p_cliente;
  if v_org is null then raise exception 'Empresa não encontrada'; end if;
  if v_chave is null or v_tp is null then raise exception 'Evento sem chave ou tipo'; end if;
  v_aceito := coalesce(v_cstat in ('135', '136', '155'), false) or (v_cstat is null and v_prot is not null);
  select id into v_nota from fis_notas where cliente_id = p_cliente and chave = v_chave;
  if v_prot is not null then
    select id into v_id from fis_eventos where cliente_id = p_cliente and chave = v_chave and tp_evento = v_tp and protocolo = v_prot;
    if v_id is not null then return v_id; end if;
  end if;
  insert into fis_eventos (org_id, cliente_id, nota_id, chave, tp_evento, descricao, sequencia, justificativa, cstat, motivo, protocolo,
                           registrado_em, origem, xml, por)
  values (v_org, p_cliente, v_nota, v_chave, v_tp, p_ev->>'descricao', coalesce((p_ev->>'sequencia')::int, 1), p_ev->>'justificativa',
          v_cstat, p_ev->>'motivo', v_prot, nullif(p_ev->>'registrado_em', '')::timestamptz, p_origem, p_xml, p_por)
  returning id into v_id;
  if v_aceito and v_nota is not null then
    if v_tp in ('110111', '110112') then
      update fis_notas set situacao = 'cancelada', atualizado_em = now() where id = v_nota;
    else
      v_man := app.fis_manifestacao_do_tipo(v_tp);
      if v_man is not null then
        update fis_notas set manifestacao = v_man, manifestacao_em = coalesce(nullif(p_ev->>'registrado_em', '')::timestamptz, now()),
               manifestacao_protocolo = v_prot, atualizado_em = now()
         where id = v_nota and not (v_man = 'ciencia' and manifestacao is not null and manifestacao <> 'ciencia');
      end if;
    end if;
  end if;
  return v_id;
end $$;
revoke all on function app.fis_gravar_evento(uuid, text, jsonb, text, uuid) from public, anon, authenticated;

-- ------------------------------------------------------------------------------------- portas das Funções Edge (service_role)
/**
 * Documento capturado (fiscal-captura): p = {cliente, origem: dfe|adn, nsu, caminho, nota?: NotaLida, evento?: EventoLido, xml?}.
 * Nota de outro CNPJ raiz é recusada (a SEFAZ só distribui da empresa; é uma trava a mais).
 */
create or replace function public.fis_gravar_documento(p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_cliente uuid := (p->>'cliente')::uuid; c clientes; v_raiz text; v_id uuid; v_ev bigint;
begin
  select * into c from clientes where id = v_cliente;
  if c.id is null then raise exception 'Empresa não encontrada'; end if;
  if p ? 'nota' then
    v_raiz := left(app.fis_digitos(c.cnpj), 8);
    if v_raiz is null or not (left(app.fis_digitos(p->'nota'->>'emitente_doc'), 8) = v_raiz
                               or left(app.fis_digitos(p->'nota'->>'destinatario_doc'), 8) = v_raiz
                               or (p->'nota'->>'conteudo') = 'resumo') then
      raise exception 'A nota não é desta empresa (CNPJ diferente)';
    end if;
    v_id := app.fis_gravar_nota(v_cliente, coalesce(p->>'origem', 'dfe'), p->'nota', p->>'caminho', nullif(p->>'nsu', '')::bigint);
    return jsonb_build_object('nota', v_id);
  elsif p ? 'evento' then
    v_ev := app.fis_gravar_evento(v_cliente, coalesce(p->>'origem', 'dfe'), p->'evento', p->>'xml', null);
    return jsonb_build_object('evento', v_ev);
  end if;
  raise exception 'Documento sem nota nem evento';
end $$;

/** Evento de manifestação enviado pela tela (fiscal-manifestar): grava aceito ou recusado, com cStat, protocolo e XML. */
create or replace function public.fis_registrar_evento(p_cliente uuid, p_evento jsonb, p_xml text, p_por uuid)
returns bigint language plpgsql security definer set search_path = public as $$
declare v_id bigint; v_org uuid;
begin
  v_id := app.fis_gravar_evento(p_cliente, 'hub', p_evento, p_xml, p_por);
  select org_id into v_org from clientes where id = p_cliente;
  insert into hub_auditoria (org_id, user_id, app, acao, alvo, depois)
  values (v_org, p_por, 'financeiro', 'notas_manifestacao', p_evento->>'chave',
          jsonb_build_object('tpEvento', p_evento->>'tpEvento', 'cStat', p_evento->>'cStat', 'protocolo', p_evento->>'protocolo'));
  return v_id;
end $$;

/**
 * Reserva as empresas que a captura pode consultar agora (captura ligada, certificado válido, passou a hora marcada,
 * sem bloqueio, ninguém rodando). Marca em_execucao_ate por 4 minutos para duas rodadas não pegarem a mesma.
 * Com p_cliente, reserva só aquela empresa (botão "Buscar agora", que respeita as mesmas travas).
 */
create or replace function public.fis_captura_reservar(p_limite int default 5, p_cliente uuid default null)
returns table (cliente_id uuid, org_id uuid, fonte text, ult_nsu bigint, cnpj text, uf text, ambiente text, ciencia_automatica boolean)
language plpgsql security definer set search_path = public as $$
begin
  insert into fis_dfe_controle (cliente_id, fonte, org_id)
  select f.cliente_id, x.fonte, f.org_id from fis_certificados f cross join (values ('nfe'), ('nfse')) x(fonte)
  on conflict do nothing;
  return query
  with alvo as (
    select d.cliente_id, d.fonte from fis_dfe_controle d
      join fis_certificados f on f.cliente_id = d.cliente_id
      join fis_parametros pr on pr.cliente_id = d.cliente_id
      join clientes c on c.id = d.cliente_id
     where pr.captura_ativa and c.ativo and f.valido_ate > now()
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

/** Fim da consulta de uma fonte: NSU só avança, próxima consulta e bloqueio conforme a regra (regras.ts › decidirDistDFe). */
create or replace function public.fis_captura_concluir(p_cliente uuid, p_fonte text, p jsonb)
returns void language sql security definer set search_path = public as $$
  update fis_dfe_controle set
    ult_nsu = greatest(ult_nsu, coalesce((p->>'ult_nsu')::bigint, ult_nsu)),
    max_nsu = coalesce((p->>'max_nsu')::bigint, max_nsu),
    proxima_consulta_em = coalesce((p->>'proxima_consulta_em')::timestamptz, now() + interval '1 hour'),
    bloqueado_ate = nullif(p->>'bloqueado_ate', '')::timestamptz,
    ultimo_cstat = p->>'cstat', ultimo_erro = nullif(p->>'erro', ''),
    ultima_consulta_em = now(), em_execucao_ate = null,
    documentos_recebidos = documentos_recebidos + coalesce((p->>'documentos')::int, 0)
  where cliente_id = p_cliente and fonte = p_fonte
$$;

-- token do agendador (gerado pelo banco, guardado no Vault; a Função confere)
do $$ begin
  if not exists (select 1 from vault.secrets where name = 'fiscal_captura_token') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'fiscal_captura_token',
      'Token interno gerado pelo banco: o pg_cron usa para chamar a Função Edge fiscal-captura.');
  end if;
end $$;
create or replace function public.fis_token_confere(p_token text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from vault.decrypted_secrets where name = 'fiscal_captura_token' and decrypted_secret = p_token)
$$;

do $$
declare f text;
begin
  foreach f in array array['fis_gravar_documento(jsonb)', 'fis_registrar_evento(uuid, jsonb, text, uuid)', 'fis_captura_reservar(integer, uuid)',
                           'fis_captura_concluir(uuid, text, jsonb)', 'fis_token_confere(text)'] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;

-- ------------------------------------------------------------------------------------- upload manual de XML (tela)
/**
 * Nota enviada pela tela (XML avulso: município fora do padrão nacional, nota com mais de 90 dias, CT-e…). A tela lê o
 * XML com o mesmo leitor da captura (documentos.ts), sobe o arquivo em <org>/<cliente>/upload/... e manda os campos.
 * p = {cliente, caminho, nota}. A nota precisa ser da empresa (CNPJ raiz do emitente ou do destinatário/tomador).
 */
create or replace function public.fis_registrar_upload(p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_cliente uuid := (p->>'cliente')::uuid; c clientes; v_raiz text; v_caminho text := p->>'caminho'; v_existe fis_notas; v_id uuid;
  v_chave text := app.fis_digitos(p->'nota'->>'chave');
begin
  select * into c from clientes where id = v_cliente;
  if c.id is null then raise exception 'Empresa não encontrada'; end if;
  if not app.fin_pode(v_cliente, 'operar') then raise exception 'Sem permissão para enviar notas desta empresa'; end if;
  if v_caminho is null or v_caminho not like c.org_id || '/' || c.id || '/upload/%' or lower(v_caminho) not like '%.xml' then
    raise exception 'Caminho do arquivo inválido';
  end if;
  v_raiz := left(app.fis_digitos(c.cnpj), 8);
  if v_raiz is null then raise exception 'Cadastre o CNPJ da empresa antes de enviar notas'; end if;
  if not (left(app.fis_digitos(p->'nota'->>'emitente_doc'), 8) = v_raiz or left(app.fis_digitos(p->'nota'->>'destinatario_doc'), 8) = v_raiz) then
    raise exception 'Esta nota não é desta empresa: o CNPJ dela não aparece como emitente nem como destinatário/tomador';
  end if;
  if coalesce(p->'nota'->>'conteudo', 'completa') <> 'completa' then raise exception 'Envie o XML completo da nota (não o resumo)'; end if;
  select * into v_existe from fis_notas where cliente_id = v_cliente and chave = v_chave;
  if v_existe.id is not null and v_existe.conteudo = 'completa' then
    raise exception 'Esta nota já está no HUB (nº %, %)', v_existe.numero, v_existe.emitente_nome;
  end if;
  v_id := app.fis_gravar_nota(v_cliente, 'upload', p->'nota', v_caminho, null);
  perform app.registrar(c.org_id, 'financeiro', 'notas_upload', v_id::text, null,
    jsonb_build_object('chave', v_chave, 'caminho', v_caminho, 'numero', p->'nota'->>'numero'));
  return jsonb_build_object('nota', v_id);
end $$;
revoke all on function public.fis_registrar_upload(jsonb) from public, anon;
grant execute on function public.fis_registrar_upload(jsonb) to authenticated;

-- ------------------------------------------------------------------------------------- lançar a nota (modelo Conta Azul)
/**
 * Lança uma nota de entrada. p = {
 *   nota, tipo_entrada, pessoa?, categoria?, centro?, conta_prevista?, local?, data_entrada?, observacao?,
 *   itens: [{id (fis_nota_itens.id), item?, novo?: {nome, unidade, ncm, controla_estoque, codigo}, fator?, lembrar?}],
 *   parcelas: [{vencimento, valor}]
 * }
 * Regras: só nota de entrada completa, autorizada e ainda não lançada; NF-e (55) só depois da Confirmação da operação;
 * o tipo de entrada (empresa › organização › geral) decide estoque e conta a pagar; contas a pagar por fin_lancar (uma por
 * parcela); estoque por app.est_gravar ('entrada', origem 'nota_entrada'); de-para lembrado. Tudo ou nada.
 */
create or replace function public.fis_processar_nota(p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  n fis_notas; regra record; v_tipo text := p->>'tipo_entrada'; v_pessoa uuid := nullif(p->>'pessoa', '')::uuid;
  v_cat uuid := nullif(p->>'categoria', '')::uuid; v_local uuid := nullif(p->>'local', '')::uuid;
  v_data date; v_grupo uuid := gen_random_uuid(); v_movs bigint[] := '{}'; v_titulos uuid[] := '{}'; v_r jsonb;
  it jsonb; ni fis_nota_itens; v_item uuid; e est_itens; v_fator numeric; v_qtd numeric; v_custo numeric;
  v_parc jsonb; k int := 0; v_n int; v_soma numeric := 0; v_doc text; v_desc text;
begin
  select * into n from fis_notas where id = (p->>'nota')::uuid for update;
  if n.id is null then raise exception 'Nota não encontrada'; end if;
  if not app.fin_pode(n.cliente_id, 'operar') then raise exception 'Sem permissão para lançar notas desta empresa'; end if;
  if n.direcao <> 'entrada' then raise exception 'Só notas de entrada são lançadas aqui'; end if;
  if n.processada then raise exception 'Esta nota já foi lançada'; end if;
  if n.situacao <> 'autorizada' then raise exception 'Nota cancelada ou denegada não pode ser lançada'; end if;
  if n.conteudo <> 'completa' then raise exception 'Ainda não temos o XML completo desta nota; dê ciência e aguarde a próxima busca, ou envie o XML'; end if;
  if n.modelo = '55' and coalesce(n.manifestacao, '') <> 'confirmada' then
    raise exception 'Confirme a operação na SEFAZ antes de lançar (só nota confirmada gera conta a pagar e estoque)';
  end if;
  select * into regra from app.fis_tipo_efetivo(n.cliente_id, v_tipo);
  if regra.movimenta_estoque is null then raise exception 'Escolha o tipo de entrada'; end if;
  v_data := coalesce(nullif(p->>'data_entrada', '')::date, (n.emissao at time zone 'America/Sao_Paulo')::date, app.hoje(n.org_id));
  v_doc := app.fis_digitos(n.emitente_doc);

  -- fornecedor: o escolhido, ou o cadastro com o mesmo CPF/CNPJ, ou cadastra agora
  if v_pessoa is null and v_doc is not null then
    select id into v_pessoa from fin_pessoas where cliente_id = n.cliente_id and documento = v_doc order by ativo desc limit 1;
  end if;
  if v_pessoa is null then
    insert into fin_pessoas (org_id, cliente_id, tipo, nome, documento, uf)
    values (n.org_id, n.cliente_id, case when v_tipo = 'devolucao_venda' then 'cliente' else 'fornecedor' end,
            coalesce(nullif(trim(n.emitente_nome), ''), 'Fornecedor ' || coalesce(v_doc, '')),
            case when length(v_doc) in (11, 14) then v_doc end, case when n.emitente_uf ~ '^[A-Z]{2}$' then n.emitente_uf end)
    returning id into v_pessoa;
  elsif not exists (select 1 from fin_pessoas where id = v_pessoa and cliente_id = n.cliente_id) then
    raise exception 'Fornecedor não encontrado nesta empresa';
  end if;

  -- itens: ligação com o estoque, de-para e entrada
  if regra.movimenta_estoque and v_local is null then
    select id into v_local from est_locais where cliente_id = n.cliente_id and padrao and ativo;
  end if;
  for ni in select * from fis_nota_itens where nota_id = n.id order by numero loop
    select x into it from jsonb_array_elements(coalesce(p->'itens', '[]')) x where (x->>'id')::bigint = ni.id;
    v_item := nullif(it->>'item', '')::uuid;
    v_fator := coalesce(nullif(it->>'fator', '')::numeric, ni.fator, 1);
    if v_fator <= 0 then raise exception 'Fator de unidade inválido no item %', ni.numero; end if;
    if v_item is null and it ? 'novo' and jsonb_typeof(it->'novo') = 'object' then
      insert into est_itens (org_id, cliente_id, codigo, nome, tipo, unidade, controla_estoque, ncm, custo)
      values (n.org_id, n.cliente_id, nullif(trim(it->'novo'->>'codigo'), ''),
              coalesce(nullif(trim(it->'novo'->>'nome'), ''), ni.descricao), 'produto',
              upper(left(coalesce(nullif(trim(it->'novo'->>'unidade'), ''), ni.unidade, 'UN'), 6)),
              coalesce((it->'novo'->>'controla_estoque')::boolean, regra.movimenta_estoque),
              case when coalesce(it->'novo'->>'ncm', ni.ncm) ~ '^\d{8}$' then coalesce(it->'novo'->>'ncm', ni.ncm) end,
              case when ni.quantidade > 0 then round(ni.valor_total / (ni.quantidade * v_fator), 4) end)
      returning id into v_item;
    end if;
    if v_item is null and ni.codigo is not null and v_doc is not null then
      select item_id, fator into v_item, v_fator from fis_depara_itens
       where cliente_id = n.cliente_id and fornecedor_doc = v_doc and codigo_fornecedor = ni.codigo;
      v_fator := coalesce(nullif(it->>'fator', '')::numeric, v_fator, 1);
    end if;
    if v_item is not null then
      select * into e from est_itens where id = v_item and cliente_id = n.cliente_id;
      if e.id is null then raise exception 'Item do estoque não encontrado nesta empresa (item % da nota)', ni.numero; end if;
      update fis_nota_itens set item_id = v_item, fator = v_fator where id = ni.id;
      if coalesce((it->>'lembrar')::boolean, true) and ni.codigo is not null and length(v_doc) in (11, 14) then
        insert into fis_depara_itens (org_id, cliente_id, fornecedor_doc, codigo_fornecedor, item_id, fator)
        values (n.org_id, n.cliente_id, v_doc, ni.codigo, v_item, v_fator)
        on conflict (cliente_id, fornecedor_doc, codigo_fornecedor) do update set item_id = excluded.item_id, fator = excluded.fator;
      end if;
    end if;
    if regra.movimenta_estoque then
      if v_item is null then raise exception 'Ligue o item % (%) a um item do estoque ou cadastre um novo', ni.numero, ni.descricao; end if;
      if e.controla_estoque and ni.quantidade > 0 then
        if v_local is null then raise exception 'Escolha o estoque (local) de entrada'; end if;
        v_qtd := round(ni.quantidade * v_fator, 4);
        -- custo de aquisição: produto + frete + seguro + outras − desconto + IPI + ICMS-ST (o que a empresa paga)
        v_custo := round((ni.valor_total + ni.frete + ni.seguro + ni.outros - ni.desconto + ni.ipi_valor + ni.icms_st_valor) / v_qtd, 4);
        v_movs := v_movs || app.est_gravar(v_item, v_local, v_data, 'entrada', v_qtd, greatest(v_custo, 0), 'nota_entrada', n.id::text,
                                           v_grupo, format('NF %s · %s', n.numero, left(coalesce(n.emitente_nome, ''), 60)));
      end if;
    end if;
    e := null;
  end loop;

  -- contas a pagar pelas parcelas da fatura
  if regra.gera_pagar then
    v_cat := coalesce(v_cat, regra.categoria_id);
    if v_cat is null then raise exception 'Escolha a categoria (despesa) desta compra'; end if;
    v_n := jsonb_array_length(coalesce(p->'parcelas', '[]'));
    if v_n = 0 then raise exception 'Informe ao menos uma parcela (vencimento e valor)'; end if;
    for v_parc in select * from jsonb_array_elements(p->'parcelas') loop
      v_soma := v_soma + coalesce((v_parc->>'valor')::numeric, 0);
    end loop;
    if round(v_soma, 2) > n.valor_total + 0.01 then
      raise exception 'A soma das parcelas (%) passa do valor da nota (%)', round(v_soma, 2), n.valor_total;
    end if;
    v_desc := format('NF %s · %s', coalesce(n.numero, ''), left(coalesce(n.emitente_nome, ''), 80));
    for v_parc in select * from jsonb_array_elements(p->'parcelas') loop
      k := k + 1;
      v_r := public.fin_lancar(jsonb_build_object(
        'cliente', n.cliente_id, 'tipo', 'pagar', 'pessoa', v_pessoa, 'categoria', v_cat, 'centro', nullif(p->>'centro', ''),
        'conta_prevista', nullif(p->>'conta_prevista', ''),
        'descricao', v_desc || case when v_n > 1 then format(' (%s/%s)', k, v_n) else '' end,
        'documento', left(format('NF %s%s', coalesce(n.numero, ''), case when v_n > 1 then '/' || k else '' end), 60),
        'emissao', (n.emissao at time zone 'America/Sao_Paulo')::date, 'vencimento', v_parc->>'vencimento',
        'valor', v_parc->>'valor', 'parcelas', 1, 'observacao', nullif(trim(p->>'observacao'), '')));
      v_titulos := v_titulos || array(select jsonb_array_elements_text(v_r->'titulos')::uuid);
    end loop;
    perform set_config('app.fin_interno', '1', true);
    update fin_titulos set nota_id = n.id where id = any(v_titulos);
    perform set_config('app.fin_interno', '', true);
  end if;

  update fis_notas set processada = true, processada_em = now(), processada_por = auth.uid(), tipo_entrada = v_tipo,
         data_entrada = v_data, pessoa_id = v_pessoa, titulos = v_titulos,
         estoque_grupo = case when cardinality(v_movs) > 0 then v_grupo end, atualizado_em = now()
   where id = n.id;
  perform app.registrar(n.org_id, 'financeiro', 'notas_lancar', n.id::text, null,
    p || jsonb_build_object('titulos', to_jsonb(v_titulos), 'movimentos', to_jsonb(v_movs)));
  return jsonb_build_object('titulos', to_jsonb(v_titulos), 'movimentos', to_jsonb(v_movs), 'pessoa', v_pessoa);
end $$;
revoke all on function public.fis_processar_nota(jsonb) from public, anon;
grant execute on function public.fis_processar_nota(jsonb) to authenticated;

/**
 * Desfaz o lançamento de uma nota (com motivo): cancela as contas a pagar (recusa se alguma já teve pagamento) e
 * estorna as entradas de estoque (recusa se deixar o estoque negativo). A nota volta a "a lançar".
 */
create or replace function public.fis_desfazer_lancamento(p_nota uuid, p_motivo text)
returns void language plpgsql security definer set search_path = public as $$
declare n fis_notas; t uuid; m est_movimentos; v_saldo numeric; v_neg boolean;
begin
  select * into n from fis_notas where id = p_nota for update;
  if n.id is null then raise exception 'Nota não encontrada'; end if;
  if not app.fin_pode(n.cliente_id, 'operar') then raise exception 'Sem permissão'; end if;
  if not n.processada then raise exception 'Esta nota não está lançada'; end if;
  if coalesce(trim(p_motivo), '') = '' then raise exception 'Informe o motivo'; end if;
  if exists (select 1 from fin_titulos where id = any(n.titulos) and (valor_pago > 0 or situacao = 'quitado')) then
    raise exception 'Uma conta a pagar desta nota já tem pagamento; estorne o pagamento antes';
  end if;
  foreach t in array n.titulos loop
    if (select situacao from fin_titulos where id = t) = 'aberto' then perform public.fin_cancelar_titulo(t, 'Lançamento da nota desfeito: ' || trim(p_motivo)); end if;
  end loop;
  v_neg := coalesce((select permite_negativo from est_parametros where cliente_id = n.cliente_id), false);
  for m in select * from est_movimentos where n.estoque_grupo is not null and grupo = n.estoque_grupo and origem = 'nota_entrada' and not estornado loop
    perform 1 from est_itens where id = m.item_id for update;
    if not v_neg then
      select coalesce(sum(quantidade), 0) into v_saldo from est_movimentos where item_id = m.item_id and local_id = m.local_id and not estornado;
      if v_saldo - m.quantidade < 0 then
        raise exception 'Desfazer deixaria o estoque negativo (item %, saldo atual %)', (select nome from est_itens where id = m.item_id), v_saldo;
      end if;
    end if;
    update est_movimentos set estornado = true, estornado_em = now(), estorno_motivo = 'Lançamento da nota desfeito: ' || trim(p_motivo) where id = m.id;
  end loop;
  update fis_notas set processada = false, processada_em = null, processada_por = null, titulos = '{}', estoque_grupo = null, atualizado_em = now()
   where id = n.id;
  perform app.registrar(n.org_id, 'financeiro', 'notas_desfazer', n.id::text, to_jsonb(n), jsonb_build_object('motivo', trim(p_motivo)));
end $$;
revoke all on function public.fis_desfazer_lancamento(uuid, text) from public, anon;
grant execute on function public.fis_desfazer_lancamento(uuid, text) to authenticated;

-- ------------------------------------------------------------------------------------- Storage (bucket privado "fiscal")
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('fiscal', 'fiscal', false, 5242880, array['application/xml', 'text/xml'])
on conflict (id) do nothing;

/** Caminho <org>/<cliente>/... de uma empresa da organização, e a pessoa tem o nível pedido no Financeiro dela. */
create or replace function app.fis_caminho_pode(p_nome text, p_nivel text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from clientes c
     where c.id = app.uuid_ou_nulo((storage.foldername(p_nome))[2])
       and c.org_id::text = (storage.foldername(p_nome))[1]
       and app.fin_pode(c.id, p_nivel))
$$;
revoke all on function app.fis_caminho_pode(text, text) from public, anon;
grant execute on function app.fis_caminho_pode(text, text) to authenticated;

drop policy if exists fis_storage_ver on storage.objects;
create policy fis_storage_ver on storage.objects for select to authenticated
  using (bucket_id = 'fiscal' and app.fis_caminho_pode(name, 'ver'));
drop policy if exists fis_storage_upload on storage.objects;
create policy fis_storage_upload on storage.objects for insert to authenticated
  with check (bucket_id = 'fiscal' and (storage.foldername(name))[3] = 'upload' and lower(name) like '%.xml'
              and app.fis_caminho_pode(name, 'operar'));
-- sem update/delete: XML fiscal não se troca nem se apaga (guarda pelo prazo decadencial)

-- ------------------------------------------------------------------------------------- agendamento
do $$ begin
  if exists (select 1 from pg_namespace where nspname = 'cron') then
    if exists (select 1 from cron.job where jobname = 'fiscal-captura') then perform cron.unschedule('fiscal-captura'); end if;
    perform cron.schedule('fiscal-captura', '*/15 * * * *', $cron$
      select net.http_post(
        url := 'https://bulqqdgfrrpqquqvjjfa.supabase.co/functions/v1/fiscal-captura',
        headers := jsonb_build_object('Content-Type', 'application/json',
          'x-agente-token', (select decrypted_secret from vault.decrypted_secrets where name = 'fiscal_captura_token')),
        body := '{"acao":"rodar"}'::jsonb,
        timeout_milliseconds := 140000)
      where exists (select 1 from public.fis_parametros p join public.fis_certificados f on f.cliente_id = p.cliente_id
                     where p.captura_ativa and f.valido_ate > now())
    $cron$);
  end if;
end $$;
