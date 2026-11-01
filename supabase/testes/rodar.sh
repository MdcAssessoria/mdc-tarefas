#!/usr/bin/env bash
# Sobe um Postgres 16 temporário, aplica a base simulada + migrações 026/028/029/030/031/033 e roda os testes do Financeiro, Licenças e Estoque/pedidos.
# Cada linha "(deve falhar)" precisa terminar em ERROR com a mensagem em português; as demais, sem erro.
set -euo pipefail
B=/usr/lib/postgresql/16/bin; D=$(mktemp -d); chown postgres "$D"
su postgres -s /bin/bash -c "$B/initdb -D $D/data -A trust >/dev/null && $B/pg_ctl -D $D/data -o '-p 5498 -k $D' -l $D/log start >/dev/null"
trap 'su postgres -s /bin/bash -c "$B/pg_ctl -D $D/data stop >/dev/null"' EXIT
R=$(cd "$(dirname "$0")/.." && pwd)
P="psql -h $D -p 5498 -U postgres -d postgres -q"
for f in testes/00_base_simulada.sql migrations/026_financeiro_base.sql migrations/028_financeiro_cadastros_titulos.sql migrations/029_estoque_itens.sql migrations/030_financeiro_correcoes_auditoria.sql migrations/031_licencas.sql migrations/033_estoque_pedidos.sql testes/10_dados.sql testes/11_dados_licencas.sql; do
  $P -v ON_ERROR_STOP=1 -f "$R/$f" 2>&1 | grep -v NOTICE || true
done
$P -f "$R/testes/20_titulos.sql" 2>&1 | grep -v "^SET$"
$P -f "$R/testes/30_estoque.sql" 2>&1 | grep -v "^SET$"
# 60: estoque e pedidos (033); a concorrência abre duas conexões extras pelo dblink
$P -v conexao="host=$D port=5498 dbname=postgres user=postgres" -f "$R/testes/60_estoque_pedidos.sql" 2>&1 | grep -v "^SET$"
# 40 por último: bloqueia/encerra contratos do cliente 1 e mudaria o acesso do Portal nos testes acima
$P -f "$R/testes/40_licencas.sql" 2>&1 | grep -v "^SET$"
