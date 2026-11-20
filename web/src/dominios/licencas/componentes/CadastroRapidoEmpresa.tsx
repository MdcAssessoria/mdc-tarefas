// Passo 1 da "Nova licença": cadastrar uma empresa que ainda não está nos clientes, sem sair da janela.
// Busca os dados pelo CNPJ (Receita), grava no cadastro de clientes com o grupo "Só licença" (para separar de quem é
// cliente da contabilidade) e já devolve a empresa escolhida. Só para gestor e administrador (RLS clientes_insert).
"use client";

import { useState } from "react";
import { useOrg } from "@/dominios/organizacao/OrgProvider";
import { supabase } from "@/lib/supabase";
import { traduzirErro } from "@/lib/erros";
import { CampoCnpj } from "@/components/ui/CampoCnpj";
import { Icone } from "@/components/ui/Icone";
import { REGIMES } from "@/dominios/clientes/tipos";
import { nomeCliente } from "@/dominios/clientes/nome";

export const GRUPO_SO_LICENCA = "Só licença";

const VAZIO = { cnpj: "", razao_social: "", nome_fantasia: "", regime: "simples", cidade: "", uf: "" };

const digitos = (s: string | null | undefined) => (s ?? "").replace(/\D/g, "");

export function CadastroRapidoEmpresa({ aoCadastrar }: { aoCadastrar: (clienteId: string) => void }) {
  const { org, clientes, papel, recarregar } = useOrg();
  const [aberto, setAberto] = useState(false);
  const [d, setD] = useState(VAZIO);
  const [erro, setErro] = useState<string | null>(null);
  const [gravando, setGravando] = useState(false);
  const pode = papel === "admin" || papel === "gestor";

  if (!pode) {
    return (
      <p className="text-xs text-neutral-600">
        A empresa não está na lista? Peça a um gestor para cadastrá-la em Configurações → Clientes.
      </p>
    );
  }

  if (!aberto) {
    return (
      <button type="button" className="btn" onClick={() => setAberto(true)}>
        <Icone nome="mais" /> Cadastrar empresa nova
      </button>
    );
  }

  const jaExiste = (() => {
    const cnpj = digitos(d.cnpj);
    if (cnpj.length < 11) return null;
    return clientes.find((c) => digitos(c.cnpj) === cnpj) ?? null;
  })();

  async function gravar() {
    setErro(null);
    if (jaExiste) {
      if (jaExiste.ativo) return aoCadastrar(jaExiste.id);
      return setErro(`${nomeCliente(jaExiste)} já está cadastrada, mas inativa. Reative em Configurações → Clientes.`);
    }
    if (digitos(d.cnpj).length < 11) return setErro("Informe o CNPJ ou CPF.");
    if (d.razao_social.trim().length < 2) return setErro("Informe a razão social (ou toque em Buscar dados).");
    setGravando(true);
    const { data, error } = await supabase()
      .from("clientes")
      .insert({
        org_id: org.id,
        cnpj: d.cnpj,
        razao_social: d.razao_social.trim(),
        nome_fantasia: d.nome_fantasia.trim() || null,
        regime: d.regime,
        cidade: d.cidade || null,
        uf: d.uf || null,
        grupos: [GRUPO_SO_LICENCA],
      })
      .select("id")
      .single();
    if (error) {
      setGravando(false);
      return setErro(error.message.includes("clientes_org_cnpj_uk") ? "Este CNPJ já está cadastrado." : traduzirErro(error));
    }
    await recarregar();
    setGravando(false);
    setD(VAZIO);
    setAberto(false);
    aoCadastrar((data as { id: string }).id);
  }

  return (
    <section className="space-y-3 rounded-lg border border-[var(--borda)] bg-[var(--fundo)] p-3" aria-label="Cadastrar empresa nova">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-semibold text-[var(--marca)]">Cadastrar empresa nova</p>
          <p className="text-xs text-neutral-600">
            Digite o CNPJ e toque em Buscar dados. A empresa entra nos clientes com o grupo &quot;{GRUPO_SO_LICENCA}&quot;.
          </p>
        </div>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <CampoCnpj
          rotulo="CNPJ/CPF"
          valor={d.cnpj}
          aoMudar={(v) => setD((x) => ({ ...x, cnpj: v }))}
          aoCarregar={(r) =>
            setD((x) => ({
              ...x,
              razao_social: r.razaoSocial,
              nome_fantasia: r.nomeFantasia ?? x.nome_fantasia,
              cidade: r.municipio ?? "",
              uf: r.uf ?? "",
              regime: r.mei ? "mei" : r.simples ? "simples" : x.regime,
            }))
          }
        />
        <label className="campo">
          <span>Regime</span>
          <select value={d.regime} onChange={(e) => setD({ ...d, regime: e.target.value })}>
            {REGIMES.map((r) => (
              <option key={r.id} value={r.id}>
                {r.nome}
              </option>
            ))}
          </select>
        </label>
        <label className="campo">
          <span>Razão social</span>
          <input value={d.razao_social} onChange={(e) => setD({ ...d, razao_social: e.target.value })} />
        </label>
        <label className="campo">
          <span>Nome curto</span>
          <input
            value={d.nome_fantasia}
            onChange={(e) => setD({ ...d, nome_fantasia: e.target.value })}
            placeholder="Como aparece nas listas"
          />
        </label>
      </div>
      {jaExiste && (
        <p className="text-sm text-amber-800">
          Este CNPJ já está cadastrado como <b>{nomeCliente(jaExiste)}</b>
          {jaExiste.ativo ? ". Toque em Usar esta empresa." : " (inativa)."}
        </p>
      )}
      {erro && (
        <p className="text-sm text-red-700" role="alert">
          {erro}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn-primario" onClick={gravar} disabled={gravando}>
          <Icone nome="check" /> {jaExiste?.ativo ? "Usar esta empresa" : gravando ? "Cadastrando…" : "Cadastrar e escolher"}
        </button>
        <button
          type="button"
          className="btn"
          onClick={() => {
            setAberto(false);
            setErro(null);
          }}
        >
          <Icone nome="voltar" /> Voltar à lista
        </button>
      </div>
    </section>
  );
}
