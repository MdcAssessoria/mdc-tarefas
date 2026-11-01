#!/usr/bin/env bash
# Sobe um Postgres 16 temporário, aplica a base simulada + migrações 026/028/029/030/034 e roda os testes do Financeiro.
# Cada linha "(deve falhar)" precisa terminar em ERROR com a mensagem em português; as demais, sem erro.
set -euo pipefail
B=/usr/lib/postgresql/16/bin; D=$(mktemp -d); chown postgres "$D"
su postgres -s /bin/bash -c "$B/initdb -D $D/data -A trust >/dev/null && $B/pg_ctl -D $D/data -o '-p 5498 -k $D' -l $D/log start >/dev/null"
trap 'su postgres -s /bin/bash -c "$B/pg_ctl -D $D/data stop >/dev/null"' EXIT
R=$(cd "$(dirname "$0")/.." && pwd)
P="psql -h $D -p 5498 -U postgres -d postgres -q"
for f in testes/00_base_simulada.sql migrations/026_financeiro_base.sql migrations/028_financeiro_cadastros_titulos.sql migrations/029_estoque_itens.sql migrations/030_financeiro_correcoes_auditoria.sql migrations/034_painel_transferencias.sql testes/10_dados.sql; do
  $P -v ON_ERROR_STOP=1 -f "$R/$f" 2>&1 | grep -v NOTICE || true
done
$P -f "$R/testes/20_titulos.sql" 2>&1 | grep -v "^SET$"
$P -f "$R/testes/30_estoque.sql" 2>&1 | grep -v "^SET$"
$P -f "$R/testes/70_transferencias.sql" 2>&1 | grep -v "^SET$"
