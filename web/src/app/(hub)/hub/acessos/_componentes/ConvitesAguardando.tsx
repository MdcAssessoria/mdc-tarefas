// Convites feitos que ainda não viraram conta (o e-mail não saiu ou a pessoa ainda não abriu o link). Sem esta lista, quem
// foi cadastrado e não recebeu o e-mail sumia da tela (12/11/2026). Daqui o administrador gera a senha provisória para
// mandar pelo WhatsApp (071) ou cancela o convite.
"use client";

import { fmtDataHora } from "@/lib/formato/datas";
import { Icone } from "@/components/ui/Icone";

export interface ConviteAguardando {
  email: string;
  nome: string | null;
  criado_em: string | null;
}

export function ConvitesAguardando({
  convites,
  aoSenha,
  aoCancelar,
}: {
  convites: ConviteAguardando[];
  aoSenha: (c: ConviteAguardando) => void;
  aoCancelar: (c: ConviteAguardando) => void;
}) {
  if (!convites.length) return null;
  return (
    <section className="cartao overflow-x-auto" aria-labelledby="convites-aguardando">
      <div className="border-b border-[var(--borda)] px-4 py-3">
        <h2 id="convites-aguardando" className="font-semibold text-[var(--marca)]">
          Convites aguardando ({convites.length})
        </h2>
        <p className="text-sm text-neutral-600">
          Pessoas cadastradas que ainda não têm acesso. Gere a senha provisória e mande pelo WhatsApp: no primeiro acesso o HUB pede
          para a pessoa criar a própria senha.
        </p>
      </div>
      <table className="tabela tabela-acoes-fixas">
        <thead>
          <tr>
            <th>Pessoa</th>
            <th>Cadastrada em</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {convites.map((c) => (
            <tr key={c.email}>
              <td>
                <div className="font-medium text-neutral-800">{c.nome || c.email}</div>
                <div className="text-xs text-neutral-500">{c.email}</div>
                <span className="chip mt-1 inline-block bg-amber-50 text-amber-900">Sem acesso ainda</span>
              </td>
              <td className="whitespace-nowrap text-sm text-neutral-600">{c.criado_em ? fmtDataHora(c.criado_em) : "—"}</td>
              <td className="whitespace-nowrap text-right">
                <div className="flex flex-wrap justify-end gap-2">
                  <button className="btn !min-h-8" onClick={() => aoSenha(c)}>
                    <Icone nome="escudo" className="h-4 w-4" />
                    Gerar senha provisória
                  </button>
                  <button className="btn !min-h-8 !text-[var(--perigo)]" onClick={() => aoCancelar(c)}>
                    <Icone nome="cancelar" className="h-4 w-4" />
                    Cancelar convite
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
