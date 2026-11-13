// Licenças Ledgra (074): o painel de cobrança saiu (a cobrança mensal fica em Gestão › Contratos); o endereço do módulo
// abre direto a lista de licenças.
import { redirect } from "next/navigation";

export default function PaginaLicencas() {
  redirect("/licencas/contratos");
}
