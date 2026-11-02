// Cadastro rápido de item: só o essencial numa janela (nome, produto/serviço, unidade, preço e custo, controla
// estoque). Usado na tela de itens e dentro do pedido, quando o item procurado não existe.
"use client";

import { useState } from "react";
import { traduzirErro } from "@/lib/erros";
import { Modal } from "@/components/ui/Modal";
import type { Cliente } from "@/dominios/clientes/tipos";
import { numeroBr } from "../regras";
import { sugerirCodigo, UNIDADES } from "../estoqueRegras";
import { salvarItem } from "../repositorio";

export function CadastroRapido({
  cliente,
  codigos,
  nomeInicial = "",
  aoFechar,
  aoSalvar,
}: {
  cliente: Cliente;
  /** Códigos já usados (para sugerir o próximo). */
  codigos: (string | null)[];
  nomeInicial?: string;
  aoFechar: () => void;
  aoSalvar: (id: string, nome: string) => void;
}) {
  const [nome, setNome] = useState(nomeInicial);
  const [tipo, setTipo] = useState<"produto" | "servico">("produto");
  const [unidade, setUnidade] = useState("UN");
  const [preco, setPreco] = useState("");
  const [custo, setCusto] = useState("");
  const [controla, setControla] = useState(true);
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);

  async function salvar() {
    if (!nome.trim()) return setErro("Dê um nome ao item.");
    const [p, c] = [numeroBr(preco), numeroBr(custo)];
    if ([p, c].some((x) => Number.isNaN(x) || x < 0)) return setErro("Confira preço e custo (números, sem sinal de menos).");
    setSalvando(true);
    setErro("");
    try {
      const id = await salvarItem({
        cliente: cliente.id,
        nome: nome.trim(),
        codigo: sugerirCodigo(codigos, tipo === "servico" ? "S" : "P"),
        tipo,
        unidade,
        controla_estoque: tipo === "produto" && controla,
        preco_venda: preco.trim() ? p : null,
        custo: custo.trim() ? c : null,
      });
      aoSalvar(id, nome.trim());
    } catch (e) {
      setErro(traduzirErro(e));
      setSalvando(false);
    }
  }

  return (
    <Modal
      titulo="Cadastro rápido de item"
      descricao="Só o essencial. Depois você completa em Estoque › Itens, se quiser."
      aoFechar={aoFechar}
    >
      <label className="campo">
        <span>Nome do item</span>
        <input value={nome} onChange={(e) => setNome(e.target.value)} />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="campo">
          <span>É um</span>
          <select
            value={tipo}
            onChange={(e) => {
              const t = e.target.value as "produto" | "servico";
              setTipo(t);
              setUnidade(t === "servico" ? "H" : "UN");
            }}
          >
            <option value="produto">Produto</option>
            <option value="servico">Serviço</option>
          </select>
        </label>
        <label className="campo">
          <span>Unidade</span>
          <select value={unidade} onChange={(e) => setUnidade(e.target.value)}>
            {UNIDADES.map((u) => (
              <option key={u.id} value={u.id}>
                {u.id} · {u.nome}
              </option>
            ))}
          </select>
        </label>
        <label className="campo">
          <span>Preço de venda (R$)</span>
          <input value={preco} onChange={(e) => setPreco(e.target.value)} inputMode="decimal" placeholder="0,00" />
        </label>
        <label className="campo">
          <span>Custo (R$)</span>
          <input value={custo} onChange={(e) => setCusto(e.target.value)} inputMode="decimal" placeholder="0,00" />
        </label>
      </div>
      {tipo === "produto" && (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={controla} onChange={(e) => setControla(e.target.checked)} />
          Controlar estoque (entra na compra, sai na venda)
        </label>
      )}
      {erro && (
        <p role="alert" className="rounded-md bg-red-50 p-2 text-sm text-red-800">
          {erro}
        </p>
      )}
      <div className="flex justify-end gap-2 pt-2">
        <button className="btn" onClick={aoFechar}>
          Cancelar
        </button>
        <button className="btn-primario" onClick={salvar} disabled={salvando}>
          {salvando ? "Salvando…" : "Cadastrar"}
        </button>
      </div>
    </Modal>
  );
}
