// Confere se as cópias do núcleo de cálculo nas Funções Edge (demonstrativo-pdf e balancete-agente) estão iguais às
// da tela. Roda o gerador (scripts/sync-funcoes.sh) e falha se ele mudou algum arquivo: nesse caso as funções
// precisam ser publicadas de novo (docs/07, seção 7.4).
import { createHash } from "node:crypto";
import { execSync } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const raiz = resolve(import.meta.dirname, "../..");
const pasta = join(raiz, "supabase/functions");

function fotografar() {
  const mapa = new Map();
  const andar = (d) => {
    for (const n of readdirSync(d)) {
      const c = join(d, n);
      if (statSync(c).isDirectory()) andar(c);
      else mapa.set(c, createHash("sha256").update(readFileSync(c)).digest("hex"));
    }
  };
  andar(pasta);
  return mapa;
}

const antes = fotografar();
execSync("sh scripts/sync-funcoes.sh", { cwd: raiz, stdio: "inherit" });
const depois = fotografar();
const mudou = [...new Set([...antes.keys(), ...depois.keys()])].filter((f) => antes.get(f) !== depois.get(f));
if (mudou.length) {
  console.error("As cópias do núcleo nas Funções Edge estavam desatualizadas e foram regeradas:");
  for (const f of mudou) console.error("  " + f.replace(raiz + "/", ""));
  console.error("Confira, faça o commit e publique as funções (docs/07, seção 7.4).");
  process.exit(1);
}
console.log("Cópias do núcleo nas Funções Edge conferidas: iguais às da tela.");
