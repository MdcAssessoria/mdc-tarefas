// Linha da tabela de Pessoas e acessos: perfil, ferramentas, situação da conta e ações de uma pessoa.
"use client";

import { useState } from "react";
import { PAPEIS } from "@/dominios/organizacao/tipos";
import { PAPEIS_APP } from "@/dominios/acessos/tipos";
import type { Membro } from "@/dominios/organizacao/tipos";
import type { PapelApp } from "@/dominios/acessos/tipos";
import { fmtDataHora } from "@/lib/formato/datas";
import type { Acesso, Conta, Perfil } from "@/dominios/acessos/tipos";
import { ADMIN } from "./niveis";
import { Chips } from "./Chips";

export function LinhaPessoa({
  m,
  perfis,
  ferramentas,
  acessos,
  conta,
  aoVincular,
  aoDefinir,
  aoReenviar,
  aoEditar,
  aoInativar,
  aoTransferir,
  souEu,
}: {
  m: Membro;
  perfis: Perfil[];
  ferramentas: { slug: string; nome: string }[];
  acessos: Acesso[];
  conta?: Conta;
  aoVincular: (perfil: string) => void;
  aoDefinir: (app: string, valor: string) => void;
  aoReenviar: () => void;
  aoEditar: () => void;
  aoInativar: (pendente: boolean) => void;
  aoTransferir: () => void;
  souEu: boolean;
}) {
  const [ajustar, setAjustar] = useState(false);
  const admin = m.papel === "admin";
  const atuais = Object.fromEntries(acessos.map((a) => [a.app, a.papel])) as Record<string, PapelApp>;
  return (
    <tr className="align-top">
      <td>
        <div className="font-medium">{m.nome}</div>
        <div className="text-xs text-neutral-500">
          {PAPEIS.find((p) => p.id === m.papel)?.nome} · {m.email}
        </div>
      </td>
      <td>
        {souEu ? (
          <span className="chip bg-[var(--marca)] text-[var(--destaque)]" title="Você não pode mudar o seu próprio perfil">
            Administrador (você)
          </span>
        ) : (
          <select
            className={`entrada !min-h-8 !py-1 text-sm ${admin ? "font-semibold text-[var(--marca)]" : ""}`}
            value={admin ? ADMIN : (m.perfil_id ?? "")}
            onChange={(e) => aoVincular(e.target.value)}
            aria-label={`Perfil de ${m.nome}`}
          >
            <option value={ADMIN}>Administrador (acesso total)</option>
            {!admin && <option value="">Manual (sem perfil)</option>}
            {perfis.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nome}
              </option>
            ))}
          </select>
        )}
      </td>
      <td>
        {admin ? (
          <span className="text-xs text-neutral-500">todas, nível Gerir</span>
        ) : (
          <>
            <Chips apps={atuais} ferramentas={ferramentas} />
            {!m.perfil_id && (
              <button className="btn-link mt-1 text-xs" onClick={() => setAjustar((x) => !x)}>
                {ajustar ? "Fechar ajuste" : "Ajustar manualmente"}
              </button>
            )}
            {ajustar && !m.perfil_id && (
              <div className="mt-2 grid gap-1 sm:grid-cols-2">
                {ferramentas.map((f) => (
                  <label key={f.slug} className="flex items-center justify-between gap-2 text-xs">
                    <span>{f.nome}</span>
                    <select
                      className="entrada !min-h-7 !py-0.5 text-xs"
                      value={atuais[f.slug] ?? ""}
                      onChange={(e) => aoDefinir(f.slug, e.target.value)}
                    >
                      <option value="">—</option>
                      {PAPEIS_APP.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.nome}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>
            )}
          </>
        )}
      </td>
      <td className="whitespace-nowrap text-xs">
        {!conta ? (
          "—"
        ) : conta.confirmado ? (
          <span className="text-neutral-600" title="Último acesso">
            {conta.ultimo_acesso ? fmtDataHora(conta.ultimo_acesso) : "ativa"}
          </span>
        ) : (
          <div className="space-y-1">
            <span className="chip bg-amber-50 text-amber-900">Aguardando criar a senha</span>
            <button className="btn-link block" onClick={aoReenviar}>
              Reenviar convite
            </button>
          </div>
        )}
      </td>
      <td className="whitespace-nowrap text-right">
        <button className="btn-link mr-3 text-sm" onClick={aoEditar}>
          Editar
        </button>
        <button
          className="btn-link mr-3 text-sm"
          onClick={aoTransferir}
          title="Passar tarefas, carteira e demais itens em aberto para outra pessoa"
        >
          Transferir
        </button>
        {!souEu && (
          <button className="btn-link text-sm !text-[var(--perigo)]" onClick={() => aoInativar(!!conta && !conta.confirmado)}>
            {conta && !conta.confirmado ? "Cancelar convite" : "Inativar"}
          </button>
        )}
      </td>
    </tr>
  );
}
