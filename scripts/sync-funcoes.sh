#!/bin/sh
# Copia as bibliotecas de cálculo do app para a Edge Function (Deno exige extensão .ts nos imports)
set -e
cd "$(dirname "$0")/.."
for f in balancete demonstracoes; do
  sed 's#from "\./\(balancete\|demonstracoes\)"#from "./\1.ts"#' web/src/lib/$f.ts > supabase/functions/demonstrativo-pdf/$f.ts
done
cp supabase/functions/demonstrativo-pdf/assinatura.ts supabase/functions/certificado/assinatura.ts
cp supabase/functions/demonstrativo-pdf/deno.json supabase/functions/certificado/deno.json
