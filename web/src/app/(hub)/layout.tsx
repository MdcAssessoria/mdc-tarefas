// Layout das telas da equipe (grupo de rotas "(hub)", que não aparece no endereço): monta a organização
// (OrgProvider: sessão, membros, clientes, ferramentas liberadas) e a moldura do HUB uma vez só. Ao navegar
// entre telas do grupo, nada disso é recarregado. /login, /portal e /tv ficam fora do grupo, com layout próprio.
import { OrgProvider } from "@/dominios/organizacao/OrgProvider";
import { Moldura } from "@/components/shell/Moldura";

export default function LayoutHub({ children }: { children: React.ReactNode }) {
  return (
    <OrgProvider>
      <Moldura>{children}</Moldura>
    </OrgProvider>
  );
}
