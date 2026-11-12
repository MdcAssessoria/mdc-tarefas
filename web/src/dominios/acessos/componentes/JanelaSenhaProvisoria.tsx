// Janela da senha provisória: o administrador digita a senha que vai mandar para a pessoa ou deixa em branco para o HUB
// gerar uma. No primeiro acesso a pessoa é obrigada a criar a própria senha (071). Serve para o primeiro acesso e para
// redefinir a senha de quem esqueceu (aí a senha atual deixa de valer).
"use client";

import { useId, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Icone } from "@/components/ui/Icone";
import { problemaSenhaProvisoria, SENHA_PROVISORIA } from "@/lib/senhaProvisoria";

export function JanelaSenhaProvisoria({
  nome,
  email,
  redefinir,
  aoFechar,
  aoConfirmar,
}: {
  nome: string;
  email: string;
  /** Quem já tem senha: a atual deixa de valer. */
  redefinir: boolean;
  aoFechar: () => void;
  /** Recebe a senha digitada ("" = o HUB gera). Lança erro para mostrar na janela. */
  aoConfirmar: (senha: string) => Promise<void>;
}) {
  const id = useId();
  const [senha, setSenha] = useState("");
  const [ver, setVer] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    const p = problemaSenhaProvisoria(senha);
    if (p) return setErro(p);
    setErro(null);
    setOcupado(true);
    try {
      await aoConfirmar(senha);
    } catch (x) {
      setErro(x instanceof Error ? x.message : String(x));
      setOcupado(false);
    }
  }

  return (
    <Modal
      titulo={redefinir ? `Redefinir a senha de ${nome}` : `Senha provisória de ${nome}`}
      descricao={
        redefinir
          ? "A senha atual deixa de valer. A pessoa entra com a provisória e cria uma nova no primeiro acesso."
          : "A pessoa entra com esta senha e, no primeiro acesso, o HUB pede para ela criar a própria senha."
      }
      aoFechar={aoFechar}
      largura="md"
      avisoRodape={
        erro && (
          <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-800">
            {erro}
          </p>
        )
      }
      rodape={
        <>
          <button type="button" className="btn" onClick={aoFechar} disabled={ocupado}>
            Voltar
          </button>
          <button type="submit" form={id} className="btn-primario" disabled={ocupado}>
            <Icone nome="escudo" className="h-4 w-4" />
            {ocupado ? "Salvando…" : senha ? "Salvar senha provisória" : "Gerar senha provisória"}
          </button>
        </>
      }
    >
      <form id={id} onSubmit={salvar} className="space-y-3">
        <p className="text-sm text-neutral-600">
          Conta: <b>{email}</b>
        </p>
        <label className="campo">
          <span>Senha provisória (em branco, o HUB gera uma)</span>
          <div className="flex gap-2">
            <input
              id={`${id}-senha`}
              type={ver ? "text" : "password"}
              autoComplete="new-password"
              maxLength={SENHA_PROVISORIA.maximo}
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              className="min-w-0 flex-1"
              placeholder={`Mínimo ${SENHA_PROVISORIA.minimo} caracteres`}
            />
            <button type="button" className="btn shrink-0" onClick={() => setVer((v) => !v)} aria-pressed={ver}>
              <Icone nome="olho" className="h-4 w-4" />
              {ver ? "Esconder" : "Mostrar"}
            </button>
          </div>
        </label>
      </form>
    </Modal>
  );
}
