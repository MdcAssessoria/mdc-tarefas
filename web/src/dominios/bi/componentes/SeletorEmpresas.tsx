// Abertura do BI: cartões das empresas ligadas ao Omie (sem números). Quem tem acesso abre; quem não tem pede, e o
// administrador ou o responsável pelo cliente aprova (30 dias). Também lista os pedidos e, para o administrador, quem
// abriu os números de cada empresa.
"use client";

import { useCallback, useMemo, useState } from "react";
import { fmtData, fmtDataHora } from "@/lib/formato/datas";
import { traduzirErro } from "@/lib/erros";
import { useConsulta } from "@/lib/useConsulta";
import { Chip } from "@/components/ui/Chip";
import { EstadoVazio } from "@/components/ui/EstadoVazio";
import { Esqueleto } from "@/components/ui/Esqueleto";
import { Icone } from "@/components/ui/Icone";
import { JanelaMotivo } from "@/components/ui/JanelaMotivo";
import { Modal } from "@/components/ui/Modal";
import { QuadroTabela } from "@/components/ui/QuadroTabela";
import { fmtDoc } from "../indicadores";
import { decidirAcesso, encerrarAcesso, lerAcessos, lerRegistro, pedirAcesso } from "../dados";
import type { AcessoBi, EmpresaBi } from "../dados";

const SITUACAO: Record<AcessoBi["situacao"], { nome: string; tom: "ambar" | "verde" | "vermelho" | "neutro" }> = {
  pedido: { nome: "Esperando aprovação", tom: "ambar" },
  aprovado: { nome: "Aprovado", tom: "verde" },
  negado: { nome: "Recusado", tom: "vermelho" },
  encerrado: { nome: "Encerrado", tom: "neutro" },
  vencido: { nome: "Vencido", tom: "neutro" },
};

export function SeletorEmpresas({
  empresas,
  aoAbrir,
  aoMudar,
  admin,
  avisar,
  pedidosAbertos,
}: {
  empresas: EmpresaBi[];
  aoAbrir: (grupo: string, ids: string[]) => void;
  aoMudar: () => void;
  admin: boolean;
  avisar: (texto: string, tom?: "erro" | "sucesso" | "atencao") => void;
  pedidosAbertos: boolean;
}) {
  const [busca, setBusca] = useState("");
  const [pedir, setPedir] = useState<EmpresaBi | null>(null);
  const [recusar, setRecusar] = useState<AcessoBi | null>(null);
  const [encerrar, setEncerrar] = useState<AcessoBi | null>(null);
  const [aprovar, setAprovar] = useState<AcessoBi | null>(null);
  const [verRegistro, setVerRegistro] = useState(false);
  const acessos = useConsulta(useCallback(() => lerAcessos(), []));

  const grupos = useMemo(() => {
    const t = busca.trim().toLowerCase();
    const dig = t.replace(/\D/g, "");
    const m = new Map<string, { id: string; nome: string; empresas: EmpresaBi[] }>();
    for (const e of empresas) {
      const ok =
        !t ||
        e.nome.toLowerCase().includes(t) ||
        e.grupo.toLowerCase().includes(t) ||
        (dig && (e.cnpj.includes(dig) || e.codigo_dominio === dig));
      if (!ok) continue;
      const g = m.get(e.grupo_id) ?? { id: e.grupo_id, nome: e.grupo, empresas: [] };
      g.empresas.push(e);
      m.set(e.grupo_id, g);
    }
    return [...m.values()];
  }, [empresas, busca]);

  const pendentes = (acessos.dados ?? []).filter((a) => a.posso_decidir);
  const meus = (acessos.dados ?? []).filter((a) => a.eu);
  const outros = (acessos.dados ?? []).filter((a) => !a.eu && !a.posso_decidir && (a.situacao === "aprovado" || a.situacao === "pedido"));
  const depois = (msg: string) => {
    avisar(msg, "sucesso");
    acessos.recarregar();
    aoMudar();
  };

  return (
    <div className="space-y-5">
      {pendentes.length > 0 && (
        <section
          className={`cartao space-y-3 p-4 ${pedidosAbertos ? "ring-2 ring-[var(--destaque)]" : ""}`}
          aria-label="Pedidos para aprovar"
        >
          <h2 className="flex items-center gap-2 text-[16px] font-semibold text-[var(--marca)]">
            <Icone nome="sino" className="h-5 w-5" />
            Pedidos de acesso para você aprovar ({pendentes.length})
          </h2>
          <ul className="space-y-2">
            {pendentes.map((a) => (
              <li key={a.id} className="flex flex-col gap-2 rounded-lg border border-[var(--borda)] p-3 sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1 text-sm">
                  <p className="font-medium">
                    {a.pessoa} quer ver <strong>{a.empresa}</strong>
                  </p>
                  <p className="text-[var(--texto-suave)]">
                    “{a.motivo}” · pedido em {fmtDataHora(a.pedido_em)}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button type="button" className="btn-primario" onClick={() => setAprovar(a)}>
                    <Icone nome="check" className="h-4 w-4" />
                    Aprovar
                  </button>
                  <button type="button" className="btn" onClick={() => setRecusar(a)}>
                    <Icone nome="cancelar" className="h-4 w-4" />
                    Recusar
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <label className="campo flex-1">
          <span>Procurar empresa</span>
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Nome, CNPJ ou código do Domínio" />
        </label>
        {admin && (
          <button type="button" className="btn" onClick={() => setVerRegistro(true)}>
            <Icone nome="olho" className="h-4 w-4" />
            Quem abriu os números
          </button>
        )}
      </div>

      {grupos.length === 0 ? (
        <EstadoVazio icone="grafico" titulo={empresas.length ? "Nenhuma empresa com esse nome" : "Nenhuma empresa ligada ao BI"}>
          {empresas.length
            ? "Troque a busca."
            : "O BI mostra os grupos de empresas ligados ao Omie. Peça à equipe técnica para ligar a empresa."}
        </EstadoVazio>
      ) : (
        grupos.map((g) => {
          const liberadas = g.empresas.filter((e) => e.liberado);
          return (
            <section key={g.id} className="space-y-2" aria-label={g.nome}>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <h2 className="flex-1 text-[17px] font-semibold text-[var(--marca)]">{g.nome}</h2>
                {liberadas.length > 1 && (
                  <button
                    type="button"
                    className="btn-primario"
                    onClick={() =>
                      aoAbrir(
                        g.nome,
                        liberadas.map((e) => e.cliente_id),
                      )
                    }
                  >
                    <Icone nome="grafico" className="h-4 w-4" />
                    Abrir o grupo ({liberadas.length} empresas)
                  </button>
                )}
              </div>
              <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {g.empresas.map((e) => (
                  <li key={e.cliente_id} className="cartao flex flex-col gap-3 p-4">
                    <div className="flex items-start gap-3">
                      <span
                        className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${e.liberado ? "bg-[var(--fundo)] text-[var(--marca)]" : "bg-neutral-100 text-neutral-500"}`}
                        aria-hidden="true"
                      >
                        <Icone nome={e.liberado ? "grafico" : "escudo"} className="h-5 w-5" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold leading-tight text-[var(--marca)]">{e.nome}</p>
                        <p className="text-xs text-[var(--texto-suave)]">
                          {fmtDoc(e.cnpj).texto}
                          {e.codigo_dominio ? ` · Domínio ${e.codigo_dominio}` : ""}
                        </p>
                        <p className="text-xs text-[var(--texto-suave)]">
                          Omie atualizado: {e.ultima_sync ? fmtDataHora(e.ultima_sync) : "ainda não"}
                        </p>
                      </div>
                    </div>
                    <div className="mt-auto flex flex-wrap items-center gap-2">
                      {e.liberado ? (
                        <>
                          <Chip tom="verde">{e.valido_ate ? `Acesso até ${fmtData(e.valido_ate)}` : "Acesso liberado"}</Chip>
                          <button type="button" className="btn-primario ml-auto" onClick={() => aoAbrir(g.nome, [e.cliente_id])}>
                            <Icone nome="seta-direita" className="h-4 w-4" />
                            Abrir
                          </button>
                        </>
                      ) : e.pedido_situacao === "pedido" ? (
                        <Chip tom="ambar">Pedido enviado, esperando aprovação</Chip>
                      ) : (
                        <>
                          <Chip tom="neutro">Sem acesso aos números</Chip>
                          <button type="button" className="btn ml-auto" onClick={() => setPedir(e)}>
                            <Icone nome="enviar" className="h-4 w-4" />
                            Pedir acesso
                          </button>
                        </>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          );
        })
      )}

      {(meus.length > 0 || outros.length > 0) && (
        <section className="space-y-2" aria-label="Acessos">
          <h2 className="text-[15px] font-semibold text-[var(--marca)]">Pedidos e acessos</h2>
          <QuadroTabela rotulo="Pedidos e acessos">
            <thead>
              <tr>
                <th>Empresa</th>
                <th>Pessoa</th>
                <th>Situação</th>
                <th>Válido até</th>
                <th>Motivo / resposta</th>
                <th>
                  <span className="sr-only">Ações</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {[...meus, ...outros].map((a) => (
                <tr key={a.id}>
                  <td data-rotulo="Empresa" className="celula-titulo">
                    {a.empresa}
                  </td>
                  <td data-rotulo="Pessoa">{a.eu ? "Você" : a.pessoa}</td>
                  <td data-rotulo="Situação">
                    <Chip tom={SITUACAO[a.situacao].tom}>{SITUACAO[a.situacao].nome}</Chip>
                  </td>
                  <td data-rotulo="Válido até">{a.valido_ate ? fmtData(a.valido_ate) : "—"}</td>
                  <td data-rotulo="Motivo">
                    {a.motivo}
                    {a.resposta && <span className="block text-xs text-[var(--texto-suave)]">Resposta: {a.resposta}</span>}
                  </td>
                  <td>
                    {(a.situacao === "pedido" || a.situacao === "aprovado") && (a.eu || admin) && (
                      <button type="button" className="btn" onClick={() => setEncerrar(a)}>
                        <Icone nome="fechar" className="h-4 w-4" />
                        {a.situacao === "pedido" ? "Desistir" : "Encerrar"}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </QuadroTabela>
        </section>
      )}

      {pedir && (
        <JanelaMotivo
          titulo={`Pedir acesso a ${pedir.nome}`}
          descricao="O administrador ou o responsável pelo cliente recebe o pedido no sino. Se aprovar, você vê os números por 30 dias."
          botao="Enviar pedido"
          aoFechar={() => setPedir(null)}
          aoConfirmar={async (motivo) => {
            await pedirAcesso(pedir.cliente_id, motivo);
            setPedir(null);
            depois("Pedido enviado. Você recebe o aviso no sino quando for respondido.");
          }}
        />
      )}
      {recusar && (
        <JanelaMotivo
          titulo={`Recusar o pedido de ${recusar.pessoa}`}
          descricao={`Para ${recusar.empresa}. A pessoa recebe o motivo no sino.`}
          botao="Recusar pedido"
          aoFechar={() => setRecusar(null)}
          aoConfirmar={async (motivo) => {
            await decidirAcesso(recusar.id, false, motivo);
            setRecusar(null);
            depois("Pedido recusado.");
          }}
        />
      )}
      {encerrar && (
        <JanelaMotivo
          titulo={encerrar.situacao === "pedido" ? "Desistir do pedido" : `Encerrar o acesso a ${encerrar.empresa}`}
          descricao="A pessoa deixa de ver os números desta empresa na hora."
          botao={encerrar.situacao === "pedido" ? "Desistir" : "Encerrar acesso"}
          aoFechar={() => setEncerrar(null)}
          aoConfirmar={async (motivo) => {
            await encerrarAcesso(encerrar.id, motivo);
            setEncerrar(null);
            depois("Pronto.");
          }}
        />
      )}
      {aprovar && (
        <JanelaAprovar
          acesso={aprovar}
          aoFechar={() => setAprovar(null)}
          aoAprovar={() => (setAprovar(null), depois("Acesso aprovado."))}
        />
      )}
      {verRegistro && <JanelaRegistro aoFechar={() => setVerRegistro(false)} />}
      {acessos.dados === undefined && !acessos.erro && <Esqueleto />}
    </div>
  );
}

function JanelaAprovar({ acesso, aoFechar, aoAprovar }: { acesso: AcessoBi; aoFechar: () => void; aoAprovar: () => void }) {
  const [dias, setDias] = useState(30);
  const [erro, setErro] = useState("");
  const [ocupado, setOcupado] = useState(false);
  async function confirmar() {
    setOcupado(true);
    setErro("");
    try {
      await decidirAcesso(acesso.id, true, null, dias);
      aoAprovar();
    } catch (e) {
      setErro(traduzirErro(e));
    } finally {
      setOcupado(false);
    }
  }
  return (
    <Modal
      titulo={`Aprovar ${acesso.pessoa} em ${acesso.empresa}`}
      descricao={`Motivo do pedido: “${acesso.motivo}”. A pessoa recebe o aviso no sino.`}
      aoFechar={aoFechar}
      avisoRodape={
        erro ? (
          <p role="alert" className="text-sm text-red-700">
            {erro}
          </p>
        ) : null
      }
      rodape={
        <>
          <button type="button" className="btn-primario" disabled={ocupado} onClick={confirmar}>
            <Icone nome="check" className="h-4 w-4" />
            {ocupado ? "Aprovando…" : "Aprovar"}
          </button>
          <button type="button" className="btn" onClick={aoFechar}>
            <Icone nome="fechar" className="h-4 w-4" />
            Cancelar
          </button>
        </>
      }
    >
      <label className="campo">
        <span>Por quantos dias</span>
        <select value={dias} onChange={(e) => setDias(Number(e.target.value))}>
          {[7, 15, 30, 60, 90].map((d) => (
            <option key={d} value={d}>
              {d} dias{d === 30 ? " (padrão)" : ""}
            </option>
          ))}
        </select>
      </label>
    </Modal>
  );
}

function JanelaRegistro({ aoFechar }: { aoFechar: () => void }) {
  const reg = useConsulta(useCallback(() => lerRegistro(30), []));
  return (
    <Modal
      titulo="Quem abriu os números (últimos 30 dias)"
      descricao="Cada relatório, indicador e orçado calculado fica registrado."
      aoFechar={aoFechar}
      largura="5xl"
      celularCheio
    >
      {reg.erro && (
        <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-800">
          {reg.erro}
        </p>
      )}
      {!reg.dados ? (
        !reg.erro && <Esqueleto />
      ) : reg.dados.length === 0 ? (
        <p className="text-sm text-[var(--texto-suave)]">Ninguém abriu números nos últimos 30 dias.</p>
      ) : (
        <QuadroTabela rotulo="Registro de acessos">
          <thead>
            <tr>
              <th>Quando</th>
              <th>Pessoa</th>
              <th>Empresas</th>
              <th>O quê</th>
              <th>Período</th>
            </tr>
          </thead>
          <tbody>
            {reg.dados.map((r, i) => (
              <tr key={`${r.em}-${i}`}>
                <td data-rotulo="Quando">{fmtDataHora(r.em)}</td>
                <td data-rotulo="Pessoa" className="celula-titulo">
                  {r.pessoa}
                </td>
                <td data-rotulo="Empresas">{r.empresas}</td>
                <td data-rotulo="O quê">{r.consulta.replace("orcado_", "orçado ").replace("dre", "DRE").replace("dfc", "DFC")}</td>
                <td data-rotulo="Período">{r.de && r.ate ? `${fmtData(r.de)} a ${fmtData(r.ate)}` : "—"}</td>
              </tr>
            ))}
          </tbody>
        </QuadroTabela>
      )}
    </Modal>
  );
}
