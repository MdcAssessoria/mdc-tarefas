#!/bin/sh
# Copia as bibliotecas de cálculo do app para a Edge Function (Deno exige extensão .ts nos imports)
set -e
cd "$(dirname "$0")/.."
python3 scripts/nucleo_balancete.py
