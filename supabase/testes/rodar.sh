#!/usr/bin/env bash
# Sobe um Postgres 16 temporário, aplica a base simulada + migrações 026/028/029/030/031/032/033/034 (e, no fim, 035 a 046) e roda os testes do Financeiro,
# Licenças, Notas fiscais, Estoque/pedidos e Transferências; depois 035 (módulos) e 036 (auditoria de 02/11/2026).
# Cada linha "(deve falhar)" precisa terminar em ERROR com a mensagem em português; as demais, sem erro.
set -euo pipefail
# porta do Postgres temporário: PORTA_TESTES=5498 bash rodar.sh troca a porta (cada cópia de trabalho usa a sua)
PORTA=${PORTA_TESTES:-5521}
B=/usr/lib/postgresql/16/bin; D=$(mktemp -d); chown postgres "$D"
su postgres -s /bin/bash -c "$B/initdb -D $D/data -A trust >/dev/null && $B/pg_ctl -D $D/data -o '-p $PORTA -k $D' -l $D/log start >/dev/null"
trap 'su postgres -s /bin/bash -c "$B/pg_ctl -D $D/data stop >/dev/null"' EXIT
R=$(cd "$(dirname "$0")/.." && pwd)
P="psql -h $D -p $PORTA -U postgres -d postgres -q"
for f in testes/00_base_simulada.sql migrations/026_financeiro_base.sql migrations/028_financeiro_cadastros_titulos.sql migrations/029_estoque_itens.sql migrations/030_financeiro_correcoes_auditoria.sql testes/05_base_fiscal.sql migrations/031_licencas.sql migrations/032_fiscal.sql migrations/033_estoque_pedidos.sql migrations/034_painel_transferencias.sql testes/10_dados.sql testes/11_dados_licencas.sql; do
  $P -v ON_ERROR_STOP=1 -f "$R/$f" 2>&1 | grep -v NOTICE || true
done
$P -f "$R/testes/20_titulos.sql" 2>&1 | grep -v "^SET$"
$P -f "$R/testes/30_estoque.sql" 2>&1 | grep -v "^SET$"
$P -f "$R/testes/50_fiscal.sql" 2>&1 | grep -v "^SET$"
# 60: estoque e pedidos (033); a concorrência abre duas conexões extras pelo dblink
$P -v conexao="host=$D port=$PORTA dbname=postgres user=postgres" -f "$R/testes/60_estoque_pedidos.sql" 2>&1 | grep -v "^SET$"
$P -f "$R/testes/70_transferencias.sql" 2>&1 | grep -v "^SET$"
# 40 por último: bloqueia/encerra contratos do cliente 1 e mudaria o acesso do Portal nos testes acima
$P -f "$R/testes/40_licencas.sql" 2>&1 | grep -v "^SET$"
# 035 por último (troca a regra real de hub_pode, que os testes acima simulam com teste.papel)
for f in testes/79_base_modulos.sql migrations/035_modulos_gestao.sql; do
  $P -v ON_ERROR_STOP=1 -f "$R/$f" 2>&1 | grep -v NOTICE || true
done
$P -f "$R/testes/80_modulos.sql" 2>&1 | grep -v "^SET$"
# 036 por último: correções da auditoria de 02/11/2026 (provas P1–P12 viram testes de regressão e "nada se apaga")
for f in testes/89_base_036.sql migrations/036_seguranca_auditoria_2026_11.sql; do
  $P -v ON_ERROR_STOP=1 -f "$R/$f" 2>&1 | grep -v NOTICE || true
done
$P -v conexao="host=$D port=$PORTA dbname=postgres user=postgres" -f "$R/testes/90_auditoria_036.sql" 2>&1 | grep -v "^SET$"
# 038: contrato do CRM pelo banco (número sem repetir, inclusive ao mesmo tempo)
for f in testes/91_base_038.sql migrations/038_crm_contrato_no_banco.sql; do
  $P -v ON_ERROR_STOP=1 -f "$R/$f" 2>&1 | grep -v NOTICE || true
done
$P -v conexao="host=$D port=$PORTA dbname=postgres user=postgres" -f "$R/testes/92_crm_038.sql" 2>&1 | grep -v "^SET$"
# 039: acesso por módulo (papel vira o tipo real; roda por último porque troca app.papel)
for f in testes/93_base_039.sql migrations/039_acesso_por_modulo.sql; do
  $P -v ON_ERROR_STOP=1 -f "$R/$f" 2>&1 | grep -v NOTICE || true
done
$P -f "$R/testes/94_acesso_039.sql" 2>&1 | grep -v "^SET$"
# 041: contratos fixos (recorrentes) e reajuste anual pelo índice; "hoje" simulado por teste.hoje
for f in testes/95_base_041.sql migrations/041_contratos_recorrentes.sql; do
  $P -v ON_ERROR_STOP=1 -f "$R/$f" 2>&1 | grep -v NOTICE || true
done
$P -f "$R/testes/96_recorrentes_041.sql" 2>&1 | grep -v "^SET$"
# 042: gestão só da MDC e segurança de 03/11/2026 (Contratos, Storage, anexos, NaN)
for f in testes/97_base_042.sql migrations/042_gestao_so_mdc_e_seguranca.sql; do
  $P -v ON_ERROR_STOP=1 -f "$R/$f" 2>&1 | grep -v NOTICE || true
done
$P -f "$R/testes/98_gestao_042.sql" 2>&1 | grep -v "^SET$"
# 043: Cobrança Ledgra pelo Ledgra Link (emissão pelo servidor, aviso de pagamento com baixa automática, sem dobrar)
for f in testes/99_base_043.sql migrations/043_ledgra_link_cobranca.sql; do
  $P -v ON_ERROR_STOP=1 -f "$R/$f" 2>&1 | grep -v NOTICE || true
done
$P -f "$R/testes/99_ledgra_link_043.sql" 2>&1 | grep -v "^SET$"
# 044: painel de certificados (cofre do HUB, só dados públicos; o Ledgra Link é buscado pela Função Edge)
for f in testes/99_base_044.sql migrations/044_painel_certificados.sql; do
  $P -v ON_ERROR_STOP=1 -f "$R/$f" 2>&1 | grep -v NOTICE || true
done
$P -f "$R/testes/99_painel_certificados_044.sql" 2>&1 | grep -v "^SET$"
# 045: faturamento dos contratos a receber (fatura, fila de envio, Portal) e correções BD-01/BD-02 da reauditoria
for f in testes/99_base_045.sql migrations/045_contratos_faturamento.sql; do
  $P -v ON_ERROR_STOP=1 -f "$R/$f" 2>&1 | grep -v NOTICE || true
done
$P -v conexao="host=$D port=$PORTA dbname=postgres user=postgres" -f "$R/testes/100_faturamento_045.sql" 2>&1 | grep -v "^SET$"
# 046: emissão da NFS-e das faturas pelo Emissor Nacional (parâmetros, nDPS sem repetir, resultado, travas, bucket fiscal)
for f in testes/101_base_046.sql migrations/046_nfse_emissao.sql; do
  $P -v ON_ERROR_STOP=1 -f "$R/$f" 2>&1 | grep -v NOTICE || true
done
$P -v conexao="host=$D port=$PORTA dbname=postgres user=postgres" -f "$R/testes/102_nfse_046.sql" 2>&1 | grep -v "^SET$"
# 047: correções da reauditoria de 03/11/2026 (anexos sem apagar, empresa da Gestão auditada, Contratos sem cadastros, NaN, anexo do Portal)
for f in testes/103_base_047.sql migrations/047_reauditoria_seguranca.sql; do
  $P -v ON_ERROR_STOP=1 -f "$R/$f" 2>&1 | grep -v NOTICE || true
done
$P -f "$R/testes/104_reauditoria_047.sql" 2>&1 | grep -v "^SET$"
# 048: regras dos contratos (vencimento no mesmo mês, reajuste negativo mantém o valor, mês cheio) e B-04 a B-09, B-12, BD-03
for f in testes/105_base_048.sql migrations/048_contratos_regras.sql; do
  $P -v ON_ERROR_STOP=1 -f "$R/$f" 2>&1 | grep -v NOTICE || true
done
$P -f "$R/testes/106_regras_048.sql" 2>&1 | grep -v "^SET$"
# 049: boleto das faturas pelo Ledgra Link (Itaú e Santander) com baixa automática pelo aviso do banco
for f in testes/107_base_049.sql migrations/049_faturas_boleto_ledgra_link.sql; do
  $P -v ON_ERROR_STOP=1 -f "$R/$f" 2>&1 | grep -v NOTICE || true
done
$P -f "$R/testes/108_boleto_049.sql" 2>&1 | grep -v "^SET$"
# 050: Portal › Faturas (lista com NFS-e e boleto; XML da nota no bucket fiscal só para o próprio cliente)
for f in testes/109_base_050.sql migrations/050_portal_faturas.sql; do
  $P -v ON_ERROR_STOP=1 -f "$R/$f" 2>&1 | grep -v NOTICE || true
done
$P -f "$R/testes/110_portal_faturas_050.sql" 2>&1 | grep -v "^SET$"
# 051: conciliação do extrato (ligar a pagamentos/contas, criar lançamento, transferência, ignorar, desfazer, travas)
for f in testes/111_base_051.sql migrations/051_conciliacao_extrato.sql; do
  $P -v ON_ERROR_STOP=1 -f "$R/$f" 2>&1 | grep -v NOTICE || true
done
$P -f "$R/testes/112_conciliacao_051.sql" 2>&1 | grep -v "^SET$"
# 052: NFS-e automática (token do agendador, uma tentativa por dia, aviso no sino) e papel timbrado do escritório
for f in testes/111_base_052.sql migrations/052_ajustes_finais.sql; do
  $P -v ON_ERROR_STOP=1 -f "$R/$f" 2>&1 | grep -v NOTICE || true
done
$P -f "$R/testes/112_ajustes_052.sql" 2>&1 | grep -v "^SET$"
# BD-04: títulos, estoque, transferências e notas de entrada com a regra de produção (só a MDC, acesso por módulo)
$P -v ON_ERROR_STOP=1 -f "$R/testes/113_base_bd04.sql" 2>&1 | grep -v NOTICE || true
$P -f "$R/testes/114_gestao_bd04.sql" 2>&1 | grep -v "^SET$"
# 053: envio automático das faturas por e-mail (Microsoft 365) e WhatsApp (Meta): fila com espera, canais e reenvio
for f in testes/115_base_053.sql migrations/053_envio_faturas.sql; do
  $P -v ON_ERROR_STOP=1 -f "$R/$f" 2>&1 | grep -v NOTICE || true
done
$P -f "$R/testes/116_envio_053.sql" 2>&1 | grep -v "^SET$"
# 054: Comercial — excluir lead de vez (só quem gere, com motivo, nunca cliente nem contrato assinado)
for f in testes/117_base_054.sql migrations/054_crm_excluir.sql; do
  $P -v ON_ERROR_STOP=1 -f "$R/$f" 2>&1 | grep -v NOTICE || true
done
$P -f "$R/testes/118_crm_excluir_054.sql" 2>&1 | grep -v "^SET$"
# 055: contrato — cliente/fornecedor nasce (ou é completado) com CNPJ, e-mail, telefone, cidade e UF
for f in testes/119_base_055.sql migrations/055_contrato_cliente.sql; do
  $P -v ON_ERROR_STOP=1 -f "$R/$f" 2>&1 | grep -v NOTICE || true
done
$P -f "$R/testes/120_contrato_cliente_055.sql" 2>&1 | grep -v "^SET$"
# 056: item de serviço com código da LC 116 / NFS-e nacional, NBS e ISS
for f in testes/121_base_056.sql migrations/056_item_servico.sql; do
  $P -v ON_ERROR_STOP=1 -f "$R/$f" 2>&1 | grep -v NOTICE || true
done
$P -f "$R/testes/122_item_servico_056.sql" 2>&1 | grep -v "^SET$"
# 057: Regras fiscais por tipo de serviço (NBS, ISS, retenção, IBS/CBS) amarradas à nota
for f in testes/123_base_057.sql migrations/057_regras_fiscais.sql; do
  $P -v ON_ERROR_STOP=1 -f "$R/$f" 2>&1 | grep -v NOTICE || true
done
$P -f "$R/testes/124_regras_fiscais_057.sql" 2>&1 | grep -v "^SET$"
# 058: nota de entrada × pedido de compra (não lança a mesma compra duas vezes)
for f in testes/125_base_058.sql migrations/058_nota_pedido.sql; do
  $P -v ON_ERROR_STOP=1 -f "$R/$f" 2>&1 | grep -v NOTICE || true
done
$P -f "$R/testes/126_nota_pedido_058.sql" 2>&1 | grep -v "^SET$"
# 059: HUB enxuto (Estoque/Entradas/Saídas fora do menu) e receita por sistema nos contratos
for f in migrations/059_sistemas_receita.sql testes/127_base_059.sql; do
  $P -v ON_ERROR_STOP=1 -f "$R/$f" 2>&1 | grep -v NOTICE || true
done
$P -f "$R/testes/128_sistemas_059.sql" 2>&1 | grep -v "^SET$"
# 060: Cobrança Ledgra fora do menu e grupo Gestão reorganizado (só dados)
$P -v ON_ERROR_STOP=1 -f "$R/migrations/060_menu_gestao.sql" 2>&1 | grep -v NOTICE || true
$P -f "$R/testes/129_menu_060.sql" 2>&1 | grep -v "^SET$"
# 061: "Notas fiscais" (entradas) de volta ao menu (só dados)
$P -v ON_ERROR_STOP=1 -f "$R/migrations/061_notas_fiscais_menu.sql" 2>&1 | grep -v NOTICE || true
$P -f "$R/testes/130_notas_061.sql" 2>&1 | grep -v "^SET$"
# 062: tabela oficial serviço × NBS (Anexo VIII) e atualização automática
for f in migrations/062_nbs_anexo_viii.sql testes/132_base_062.sql; do
  $P -v ON_ERROR_STOP=1 -f "$R/$f" 2>&1 | grep -v NOTICE || true
done
$P -f "$R/testes/131_nbs_062.sql" 2>&1 | grep -v "^SET$"
# 063: carga da tabela NBS com DELETE ... WHERE (pg_safeupdate do Supabase); mesma lógica testada na 131 (T9 a T11)
$P -v ON_ERROR_STOP=1 -f "$R/migrations/063_nbs_carga.sql" 2>&1 | grep -v NOTICE || true
# 064: cadastro no Ledgra Link pelo HUB (Contratos › gerir)
$P -v ON_ERROR_STOP=1 -f "$R/migrations/064_ledgra_link_cadastros.sql" 2>&1 | grep -v NOTICE || true
$P -f "$R/testes/133_ledgra_cadastros_064.sql" 2>&1 | grep -v "^SET$"
# 065: notas fiscais de saída (uma por fatura com NFS-e, ajustes antes de emitir, lista)
$P -v ON_ERROR_STOP=1 -f "$R/migrations/065_notas_saida.sql" 2>&1 | grep -v NOTICE || true
$P -f "$R/testes/134_notas_saida_065.sql" 2>&1 | grep -v "^SET$"
# 066: código interno do retransmissor da NFS-e (envio pelo site, Node)
$P -v ON_ERROR_STOP=1 -f "$R/migrations/066_nfse_retransmissor.sql" 2>&1 | grep -v NOTICE || true
$P -f "$R/testes/135_relay_066.sql" 2>&1 | grep -v "^SET$"
# 069/070: convite/link de criar senha para conta confirmada pelo link mas ainda sem senha (e a lista de Acessos)
$P -v ON_ERROR_STOP=1 -f "$R/migrations/069_convite_sem_senha.sql" 2>&1 | grep -v NOTICE || true
$P -f "$R/testes/136_convite_069.sql" 2>&1 | grep -v "^SET$"
$P -v ON_ERROR_STOP=1 -f "$R/migrations/070_situacao_conta_senha.sql" 2>&1 | grep -v NOTICE || true
$P -f "$R/testes/137_situacao_070.sql" 2>&1 | grep -v "^SET$"
# 071: senha provisória pelo administrador e troca obrigatória no primeiro acesso
$P -c "alter table auth.users add column if not exists raw_app_meta_data jsonb; insert into app.convites (org_id, email) values ('00000000-0000-0000-0000-0000000000a1', 'sem.conta@exemplo.com');" >/dev/null
$P -v ON_ERROR_STOP=1 -f "$R/migrations/071_senha_provisoria.sql" 2>&1 | grep -v NOTICE || true
$P -f "$R/testes/138_senha_provisoria_071.sql" 2>&1 | grep -v "^SET$"
# 073: acervo de documentos societários do cliente (guardar, substituir, editar, retirar)
for f in testes/139_base_073.sql migrations/073_societario_acervo.sql; do
  $P -v ON_ERROR_STOP=1 -f "$R/$f" 2>&1 | grep -v NOTICE || true
done
$P -f "$R/testes/140_acervo_073.sql" 2>&1 | grep -v "^SET$"
