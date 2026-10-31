// Janela de cadastro de pessoa nova: dados, papel, setor, perfil de acesso e envio do convite.
"use client";

import { useState } from "react";
import { useOrg } from "@/lib/org";
import { supabase } from "@/lib/supabase";
import { traduzirErro } from "@/lib/erros";
import { enviarConvite } from "@/lib/convite";
import { PAPEIS } from "@/lib/types";
import type { Papel } from "@/lib/types";
import type { Perfil } from "@/dominios/acessos/tipos";

export function Cadastro({
  perfis,
  setores,
  aoFechar,
  aoCadastrar,
}: {
  perfis: Perfil[];
  setores: { id: string; nome: string }[];
  aoFechar: () => void;
  aoCadastrar: (txt: string, link?: string) => void;
}) {
  const { org } = useOrg();
  const [email, setEmail] = useState("");
  const [nome, setNome] = useState("");
  const [papel, setPapel] = useState<Papel>("analista");
  const [setor, setSetor] = useState("");
  const [perfil, setPerfil] = useState(perfis.find((p) => p.nome === "Fiscal")?.id ?? perfis[0]?.id ?? "");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    setEnviando(true);
    const { data, error } = await supabase().rpc("hub_convidar", {
      p_org: org.id,
      p_email: email,
      p_nome: nome,
      p_papel: papel,
      p_setor: setor || null,
      p_perfil: papel === "admin" ? null : perfil || null,
    });
    if (error) {
      setEnviando(false);
      return setErro(traduzirErro(error));
    }
    if (data !== "convite") {
      setEnviando(false);
      return aoCadastrar(`${nome || email} já tinha conta no Hub e recebeu o acesso agora.`);
    }
    const r = await enviarConvite(email, nome);
    setEnviando(false);
    if (r.enviado) return aoCadastrar(`Convite enviado para ${email}. A pessoa recebe um e-mail com o link para criar a senha.`);
    aoCadastrar(
      `${nome || email} foi cadastrado, mas o e-mail não pôde ser enviado${r.erro ? ` (${r.erro})` : ""}. Repasse este link para a pessoa criar a senha:`,
      r.link,
    );
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={aoFechar}>
      <form onSubmit={enviar} onClick={(e) => e.stopPropagation()} className="cartao w-full max-w-md space-y-3 p-5">
        <div>
          <h2 className="text-lg font-semibold text-[var(--marca)]">Cadastrar pessoa da equipe</h2>
          <p className="text-sm text-neutral-600">A pessoa recebe um e-mail e cria a própria senha. Você não precisa definir senha.</p>
        </div>
        <label className="campo">
          <span>Nome</span>
          <input required value={nome} onChange={(e) => setNome(e.target.value)} />
        </label>
        <label className="campo">
          <span>E-mail</span>
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="campo">
            <span>Papel nas tarefas</span>
            <select value={papel} onChange={(e) => setPapel(e.target.value as Papel)}>
              {PAPEIS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome}
                </option>
              ))}
            </select>
          </label>
          <label className="campo">
            <span>Setor</span>
            <select value={setor} onChange={(e) => setSetor(e.target.value)}>
              <option value="">—</option>
              {setores.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nome}
                </option>
              ))}
            </select>
          </label>
        </div>
        {papel !== "admin" ? (
          <label className="campo">
            <span>Perfil de acesso (define as ferramentas)</span>
            <select required value={perfil} onChange={(e) => setPerfil(e.target.value)}>
              <option value="" disabled>
                Escolha…
              </option>
              {perfis.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <p className="text-xs text-neutral-500">Administradores acessam todas as ferramentas.</p>
        )}
        {erro && <p className="text-sm text-red-700">{erro}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className="btn" onClick={aoFechar}>
            Cancelar
          </button>
          <button className="btn-primario" disabled={enviando}>
            {enviando ? "Enviando…" : "Cadastrar e enviar convite"}
          </button>
        </div>
      </form>
    </div>
  );
}
