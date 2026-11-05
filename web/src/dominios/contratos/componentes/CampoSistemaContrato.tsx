// Campo "Sistema vendido" do contrato a receber (059): a licença é de qual sistema ou módulo (Ledgra, EXato…). Opcional:
// honorários e outros serviços ficam sem sistema. Quem gere Contratos cadastra um sistema novo sem sair do contrato.
"use client";

import { useCallback, useState } from "react";
import { useConsulta } from "@/lib/useConsulta";
import { Icone } from "@/components/ui/Icone";
import { lerSistemas } from "../leituras";
import { JanelaSistema } from "./JanelaSistema";

export function CampoSistemaContrato({
  cliente,
  valor,
  aoMudar,
  podeCriar,
}: {
  cliente: string;
  valor: string;
  aoMudar: (id: string) => void;
  podeCriar: boolean;
}) {
  const consulta = useConsulta(useCallback(() => lerSistemas(cliente), [cliente]));
  const [novo, setNovo] = useState(false);
  const opcoes = (consulta.dados ?? []).filter((s) => s.ativo || s.id === valor);

  return (
    <div className="campo">
      <span>Sistema vendido (opcional)</span>
      <select value={valor} onChange={(e) => aoMudar(e.target.value)} aria-label="Sistema vendido">
        <option value="">Nenhum (honorários ou outro serviço)</option>
        {opcoes.map((s) => (
          <option key={s.id} value={s.id}>
            {s.nome}
            {s.ativo ? "" : " (inativo)"}
          </option>
        ))}
      </select>
      <small className="text-xs text-[var(--texto-suave)]">
        Licença de um sistema ou módulo da MDC: a receita aparece em Contratos › Receita por sistema.
      </small>
      {podeCriar && (
        <button type="button" className="btn-link self-start text-xs" onClick={() => setNovo(true)}>
          <Icone nome="mais" className="inline h-4 w-4 align-[-3px]" />
          Novo sistema
        </button>
      )}
      {novo && (
        <JanelaSistema
          cliente={cliente}
          aoFechar={() => setNovo(false)}
          aoSalvar={(id) => {
            setNovo(false);
            consulta.recarregar();
            aoMudar(id);
          }}
        />
      )}
    </div>
  );
}
