\set ON_ERROR_STOP 1
-- Base para a 052 (NFS-e automática e papel timbrado; roda por último). Nada novo a criar: a MDC (c41, CNPJ
-- 48.140.121/0001-65) já é a empresa da gestão da org a1 (bases 042/045), os parâmetros da NFS-e e as faturas vêm da 046
-- e o Vault/pg_cron simulados vêm de 05_base_fiscal. Aqui só se confere o ponto de partida.
select count(*) = 1 as mdc_e_a_empresa_da_gestao
  from organizacoes o join clientes c on c.id = o.gestao_cliente_id
 where o.id = '00000000-0000-0000-0000-0000000000a1' and regexp_replace(c.cnpj, '\D', '', 'g') = '48140121000165';
