// Janela de cadastro de pessoa nova: dados, papel, setor, módulos que ela vê (escolhidos um a um ou por perfil pronto)
// e envio do convite. Só o administrador chega aqui (a tela e o banco conferem).
"use client";

import { useState } from "react";
import { useOrg } from "@/dominios/organizacao/OrgProvider";
import { supabase } from "@/lib/supabase";
import { traduzirErro } from "@/lib/erros";
import { enviarConvite } from "@/dominios/acessos/convite";
import { PAPEIS } from "@/dominios/organizacao/tipos";
import type { Papel } from "@/dominios/organizacao/tipos";
import type { HubApp, Perfil } from "@/dominios/acessos/tipos";
import type { Json } from "@/lib/database.types";
import { Modal } from "@/components/ui/Modal";
import { Icone } from "@/components/ui/Icone";
import { EscolhaModulos } from "./EscolhaModulos";
import type { Modulos } from "./EscolhaModulos";

export function Cadastro({
  perfis,
  setores,
  ferramentas,
  aoFechar,
  aoCadastrar,
}: {
  perfis: Perfil[];
  setores: { id: string; nome: string }[];
  ferramentas: HubApp[];
  aoFechar: () => void;
  aoCadastrar: (txt: string, link?: string) => void;
}) {
  const { org } = useOrg();
  const [email, setEmail] = useState("");
  const [nome, setNome] = useState("");
  const [papel, setPapel] = useState<Papel>("analista");
  const [setor, setSetor] = useState("");
  const [modo, setModo] = useState<"modulos" | "perfil">("modulos");
  const [modulos, setModulos] = useState<Modulos>({ tarefas: "operar" });
  const [perfil, setPerfil] = useState(perfis[0]?.id ?? "");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const admin = papel === "admin";
  const perfilEscolhido = perfis.find((p) => p.id === perfil);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    if (!admin && modo === "modulos" && Object.keys(modulos).length === 0) return setErro("Marque ao menos um módulo para a pessoa ver.");
    if (!admin && modo === "perfil" && !perfil) return setErro("Escolha o perfil de acesso.");
    setEnviando(true);
    const { data, error } = await supabase().rpc("hub_convidar", {
      p_org: org.id,
      p_email: email,
      p_nome: nome,
      p_papel: papel,
      p_setor: setor || null,
      p_perfil: admin || modo === "modulos" ? null : perfil || null,
      p_apps: !admin && modo === "modulos" ? (modulos as unknown as Json) : undefined,
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
    if (r.enviado)
      return aoCadastrar(
        `Convite enviado para ${email}. A pessoa recebe um e-mail com o link para criar a senha. Se preferir, use também “Link para WhatsApp” na linha da pessoa.`,
      );
    aoCadastrar(
      r.link
        ? `${nome || email} foi cadastrado, mas o e-mail não pôde ser enviado. Mande o acesso pelo WhatsApp:`
        : `${nome || email} foi cadastrado, mas o e-mail não pôde ser enviado${r.erro ? ` (${r.erro})` : ""}. Use “Link para WhatsApp” na linha da pessoa para mandar o acesso por lá.`,
      r.link,
    );
  }

  return (
    <Modal
      titulo="Cadastrar pessoa da equipe"
      descricao="Escolha o que a pessoa vai ver no HUB. Ela recebe um e-mail e cria a própria senha; você não define senha."
      aoFechar={aoFechar}
      largura="2xl"
    >
      <form onSubmit={enviar} className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="campo">
            <span>Nome</span>
            <input required value={nome} onChange={(e) => setNome(e.target.value)} />
          </label>
          <label className="campo">
            <span>E-mail</span>
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
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
        {admin ? (
          <p className="rounded-md bg-[var(--fundo)] p-3 text-sm text-neutral-700">
            Administrador vê todos os módulos e esta tela de pessoas e acessos.
          </p>
        ) : (
          <>
            <div role="radiogroup" aria-label="Como liberar os módulos" className="grid gap-2 sm:grid-cols-2">
              {(
                [
                  ["modulos", "Escolher os módulos", "Marque um a um o que a pessoa vê e em que nível."],
                  ["perfil", "Usar um perfil pronto", "A pessoa segue o perfil: mudou o perfil, muda para todos que o seguem."],
                ] as const
              ).map(([id, titulo, texto]) => (
                <button
                  key={id}
                  type="button"
                  role="radio"
                  aria-checked={modo === id}
                  onClick={() => setModo(id)}
                  className={`rounded-lg border p-3 text-left text-sm ${modo === id ? "border-[var(--marca)] bg-[var(--fundo)]" : "border-[var(--borda)] bg-white"}`}
                >
                  <span className="flex items-center gap-2 font-medium text-[var(--texto)]">
                    <Icone nome={modo === id ? "check" : id === "modulos" ? "lista" : "pessoas"} className="h-4 w-4" />
                    {titulo}
                  </span>
                  <span className="mt-1 block text-xs text-[var(--texto-suave)]">{texto}</span>
                </button>
              ))}
            </div>
            {modo === "modulos" ? (
              <EscolhaModulos apps={ferramentas} valor={modulos} aoMudar={setModulos} perfis={perfis} />
            ) : (
              <>
                <label className="campo">
                  <span>Perfil de acesso</span>
                  <select value={perfil} onChange={(e) => setPerfil(e.target.value)}>
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
                {perfilEscolhido && (
                  <p className="text-xs text-[var(--texto-suave)]">
                    Libera:{" "}
                    {Object.entries(perfilEscolhido.apps)
                      .map(([k, v]) => `${ferramentas.find((a) => a.slug === k)?.nome ?? k} (${v})`)
                      .join(", ") || "nenhum módulo"}
                  </p>
                )}
              </>
            )}
          </>
        )}
        {erro && (
          <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-800">
            {erro}
          </p>
        )}
        <div className="flex flex-wrap justify-end gap-2 pt-1">
          <button type="button" className="btn" onClick={aoFechar}>
            Voltar
          </button>
          <button className="btn-primario" disabled={enviando}>
            <Icone nome="enviar" className="h-4 w-4" />
            {enviando ? "Enviando…" : "Cadastrar e enviar convite"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
