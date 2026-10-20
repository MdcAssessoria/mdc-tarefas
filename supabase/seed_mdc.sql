-- =====================================================================
--  Implantação da MDC como primeira organização.
--  1) Crie seu usuário em Authentication > Users (ou pela tela de login).
--  2) Ajuste o e-mail abaixo e rode este script no SQL Editor.
--  Os prazos são PRAZOS INTERNOS de exemplo (sempre antecipam em fim de
--  semana/feriado). Revise-os na tela Configurações > Obrigações.
-- =====================================================================
do $$
declare
  v_email text := 'edvaldo@mdcassessoria.com';
  v_user  uuid;
  v_org   uuid;
  s_fis uuid; s_con uuid; s_dp uuid; s_soc uuid;
begin
  select id into v_user from auth.users where email = v_email;
  if v_user is null then raise exception 'Usuário % não encontrado em auth.users', v_email; end if;

  insert into public.organizacoes (nome, slug, cnpj, logo_url, cor_primaria, cor_destaque)
  values ('MDC Assessoria', 'mdc', '48.140.121/0001-65',
          'https://mdcassessoria.com/wp-content/uploads/2024/07/Logo-MDC5.png', '#0B2820', '#E2C17E')
  on conflict (slug) do update set nome = excluded.nome
  returning id into v_org;

  insert into public.setores (org_id, nome, cor, ordem) values
    (v_org, 'Fiscal', '#E2C17E', 1), (v_org, 'Contábil', '#7FB3A0', 2),
    (v_org, 'Departamento Pessoal', '#9DB4E0', 3), (v_org, 'Societário', '#D9A6A6', 4)
  on conflict (org_id, nome) do nothing;

  select id into s_fis from public.setores where org_id = v_org and nome = 'Fiscal';
  select id into s_con from public.setores where org_id = v_org and nome = 'Contábil';
  select id into s_dp  from public.setores where org_id = v_org and nome = 'Departamento Pessoal';
  select id into s_soc from public.setores where org_id = v_org and nome = 'Societário';

  insert into public.membros (org_id, user_id, nome, email, papel)
  values (v_org, v_user, 'Edvaldo Ribeiro de Carvalho', v_email, 'admin')
  on conflict (org_id, user_id) do update set papel = 'admin', ativo = true;

  if not exists (select 1 from public.modelos_recorrentes where org_id = v_org) then
    insert into public.modelos_recorrentes
      (org_id, titulo, setor_id, prioridade, regimes, meses, dia_vencimento, meses_apos_competencia) values
      (v_org, 'Fechamento da folha',                  s_dp,  'alta',    null,                    null,          5,  1),
      (v_org, 'eSocial / DCTFWeb',                    s_dp,  'alta',    null,                    null,          12, 1),
      (v_org, 'EFD-Reinf',                            s_fis, 'alta',    array['presumido','real'], null,        12, 1),
      (v_org, 'PGDAS-D (Simples Nacional)',           s_fis, 'alta',    array['simples'],        null,          17, 1),
      (v_org, 'SPED Fiscal (EFD ICMS/IPI)',           s_fis, 'media',   array['presumido','real'], null,        17, 1),
      (v_org, 'EFD-Contribuições',                    s_fis, 'media',   array['presumido','real'], null,        8,  2),
      (v_org, 'Apuração IRPJ/CSLL trimestral',        s_fis, 'alta',    array['presumido','real'], array[3,6,9,12], 25, 1),
      (v_org, 'Conciliação e fechamento contábil',    s_con, 'media',   array['presumido','real'], null,        25, 1),
      (v_org, 'DEFIS',                                s_con, 'media',   array['simples'],        array[12],     20, 3),
      (v_org, 'ECD',                                  s_con, 'alta',    array['presumido','real'], array[12],   20, 6),
      (v_org, 'ECF',                                  s_con, 'alta',    array['presumido','real'], array[12],   20, 7);
  end if;

  raise notice 'Organização MDC pronta: %', v_org;
end $$;
