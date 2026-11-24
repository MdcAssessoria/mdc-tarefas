-- 118 · Recarga das empresas ligadas à Omie (depois da 117 e da função omie-sincronizar que lê departamentos e pedidos)
-- A carga volta mês a mês desde sincronizar_desde (1 mês por rodada, a cada 5 minutos) para gravar o rateio por centro de
-- custo dos títulos antigos e os pedidos de venda. Nada é apagado: os dados atuais continuam valendo durante a recarga.
update public.omie_empresas set carga_completa_feita = false, carga_ate = null where ativo;
