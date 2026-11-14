#!/usr/bin/env bash
# Testes da 080 (PIN das organizações pessoais) num Postgres 16 temporário. Uso: bash supabase/testes/rodar_pin.sh
set -euo pipefail
PORTA=${PORTA_TESTES:-5522}
B=/usr/lib/postgresql/16/bin; D=$(mktemp -d); chown postgres "$D"
su postgres -s /bin/bash -c "$B/initdb -D $D/data -A trust >/dev/null && $B/pg_ctl -D $D/data -o '-p $PORTA -k $D' -l $D/log start >/dev/null"
trap 'su postgres -s /bin/bash -c "$B/pg_ctl -D $D/data stop >/dev/null"' EXIT
R=$(cd "$(dirname "$0")/.." && pwd)
P="psql -h $D -p $PORTA -U postgres -d postgres -q"
$P -v ON_ERROR_STOP=1 -f "$R/testes/109_base_080.sql" 2>&1 | grep -v NOTICE || true
$P -v ON_ERROR_STOP=1 -f "$R/migrations/080_pin_organizacoes_pessoais.sql" 2>&1 | grep -v NOTICE || true
# a migração marca as organizações reais pelo id; na base simulada marca a de teste
$P -c "update public.organizacoes set exige_pin = true where id = '00000000-0000-0000-0000-00000000000b'"
$P -f "$R/testes/110_pin_080.sql" 2>&1 | grep -v "^SET$"
