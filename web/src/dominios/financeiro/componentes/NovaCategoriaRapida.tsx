// Cadastro rápido de categoria (despesa ou receita) sem sair da tela de lançamento: nome, grupo e a conta do plano onde
// ela é contabilizada. Usado ao lançar nota de entrada e conta a pagar/receber quando falta a categoria certa.
"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { useConsulta } from "@/lib/useConsulta";
import { traduzirErro } from "@/lib/erros";
import { Modal } from "@/components/ui/Modal";
import { Icone } from "@/components/ui/Icone";
import { lerPlano } from "../leituras";
import { EscolhaConta } from "./CadCategorias";

export function NovaCategoriaRapida({
  cliente,
  tipo,
  aoFechar,
  aoCriar,
}: {
  cliente: { id: string; org_id: string };
  tipo: "despesa" | "receita";
  aoFechar: () => void;
  /** Recebe o id da categoria criada, para a tela já deixá-la escolhida. */
  aoCriar: (id: string) => void;
}) {
  const plano = useConsulta(useCallback(() => lerPlano(cliente.id), [cliente.id]));
  const analiticas = (plano.dados ?? []).filter((c) => c.analitica && c.ativo);
  const [nome, setNome] = useState("");
  const [grupo, setGrupo] = useState("");
  const [conta, setConta] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    if (!nome.trim()) return setErro("Dê um nome (ex.: Sistemas e softwares, Aluguel, Energia).");
    if (!conta) return setErro("Escolha a conta do plano de contas onde ela vai ser contabilizada.");
    setSalvando(true);
    const { data, error } = await supabase()
      .from("fin_categorias")
      .insert({
        org_id: cliente.org_id,
        cliente_id: cliente.id,
        tipo,
        nome: nome.trim(),
        grupo: grupo.trim() || null,
        conta_contabil_id: conta,
      })
      .select("id")
      .single();
    setSalvando(false);
    if (error) return setErro(traduzirErro(error));
    aoCriar((data as { id: string }).id);
  }

  return (
    <Modal
      titulo={`Nova categoria de ${tipo}`}
      descricao="A categoria diz para onde o valor vai nos relatórios e em qual conta do plano ele é contabilizado."
      aoFechar={aoFechar}
      largura="lg"
    >
      {plano.carregando ? (
        <p className="text-sm text-[var(--texto-suave)]">Carregando o plano de contas…</p>
      ) : analiticas.length === 0 ? (
        <div className="space-y-3 text-sm">
          <p>Para criar categorias, esta empresa precisa do plano de contas (o do Domínio). Ele ainda não foi importado.</p>
          <Link href="/plano-contas" target="_blank" className="btn-primario inline-flex">
            <Icone nome="importar" className="h-4 w-4" />
            Importar o plano de contas
          </Link>
        </div>
      ) : (
        <form onSubmit={salvar} className="space-y-3">
          <label className="campo">
            <span>Nome da categoria</span>
            <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Sistemas e softwares" />
          </label>
          <label className="campo">
            <span>Grupo (opcional)</span>
            <input value={grupo} onChange={(e) => setGrupo(e.target.value)} placeholder="Ex.: Despesas administrativas" />
          </label>
          <div className="campo [&_input]:w-full [&_select]:w-full">
            <span>Conta do plano de contas</span>
            <EscolhaConta contas={analiticas} valor={conta} aoMudar={setConta} />
          </div>
          {erro && (
            <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-800">
              {erro}
            </p>
          )}
          <div className="flex flex-wrap justify-end gap-2 pt-1">
            <button type="button" className="btn" onClick={aoFechar}>
              Voltar
            </button>
            <button className="btn-primario" disabled={salvando}>
              <Icone nome="check" className="h-4 w-4" />
              {salvando ? "Salvando…" : "Criar e usar"}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
