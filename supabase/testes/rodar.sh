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
# 048: regras dos contratos (vencimento no mesmo mês, reajuste negativo mantém o valor, mês cheio) e B-04 a B-09, B-12, BD-03
for f in testes/105_base_048.sql migrations/048_contratos_regras.sql; do
  $P -v ON_ERROR_STOP=1 -f "$R/$f" 2>&1 | grep -v NOTICE || true
done
$P -f "$R/testes/106_regras_048.sql" 2>&1 | grep -v "^SET$"
