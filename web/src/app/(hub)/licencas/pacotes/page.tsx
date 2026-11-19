// Sistemas › Pacotes de licença (091): os pacotes que a MDC vende em cada sistema — módulos, preço, quantos usuários
// entram (qualquer número ou sem limite), o valor do usuário a mais e o que acontece quando passa do limite. Montar e
// editar exige "gerir" (que também vê os valores); quem só vê licenças enxerga a composição e os usuários. Duas vistas:
// cartões (um por pacote) e a grade módulo × pacote para marcar vários de uma vez. Filtros, PDF e Excel.
"use client";

import { useMemo, useState } from "react";
import { useOrg } from "@/dominios/organizacao/OrgProvider";
import { brl } from "@/lib/formato/moeda";
import { fmtData } from "@/lib/formato/datas";
import { plural } from "@/lib/formato/numero";
import { Carregando } from "@/components/ui/Carregando";
import { EstadoVazio } from "@/components/ui/EstadoVazio";
import { useAviso } from "@/components/ui/Aviso";
import { BotoesExportar } from "@/components/ui/BotoesExportar";
import { nomeArquivo } from "@/lib/arquivos/exportarLista";
import { Icone } from "@/components/ui/Icone";
import { Chip } from "@/components/ui/Chip";
import { Cabecalho, useDadosLicencas } from "@/dominios/licencas/componentes/Base";
import { QuadroPacotes } from "@/dominios/licencas/componentes/TabelasPrecos";
import { JanelaPacote } from "@/dominios/licencas/componentes/JanelaPacote";
import { resumoPacote, textoExcedente, textoUsuariosPacote } from "@/dominios/licencas/pacotes";
import type { Plano } from "@/dominios/licencas/tipos";

type Vista = "cartoes" | "grade";
type Situacao = "venda" | "fora" | "todos";

export default function PaginaPacotes() {
  const { org } = useOrg();
  const dados = useDadosLicencas();
  const { hoje, podeGerir, nomeSistema } = dados;
  const { aviso, mostrar } = useAviso();
  const [sistema, setSistema] = useState("");
  const [situacao, setSituacao] = useState<Situacao>("venda");
  const [busca, setBusca] = useState("");
  const [vista, setVista] = useState<Vista>("cartoes");
  const [janela, setJanela] = useState<Plano | "novo" | null>(null);
  const d = dados.dados;

  const emUso = (id: string) => (d?.contratos ?? []).filter((k) => k.situacao === "ativo" && k.plano_id === id).length;
  const nomesModulos = (p: Plano) =>
    p.produtos
      .map((id) => dados.produtos.get(id))
      .filter(Boolean)
      .sort((a, b) => a!.ordem - b!.ordem)
      .map((m) => m!.nome);
  const resumo = (p: Plano) =>
    resumoPacote(
      {
        precosModulos: p.produtos.map((id) => dados.produtos.get(id)?.preco ?? 0),
        preco: p.preco,
        usuarios_incluidos: p.usuarios_incluidos,
        valor_usuario_adicional: p.valor_usuario_adicional,
        excedente: p.excedente,
      },
      p.usuarios_incluidos ?? 1,
    );

  const lista = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return (d?.planos ?? [])
      .filter(
        (p) =>
          (!sistema || p.sistema === sistema) &&
          (situacao === "todos" || (situacao === "venda" ? p.ativo : !p.ativo)) &&
          (!q ||
            `${p.nome} ${p.descricao} ${p.produtos.map((id) => dados.produtos.get(id)?.nome ?? "").join(" ")}`.toLowerCase().includes(q)),
      )
      .sort((a, b) => nomeSistema(a.sistema).localeCompare(nomeSistema(b.sistema)) || a.nome.localeCompare(b.nome));
  }, [d, sistema, situacao, busca, dados.produtos, nomeSistema]);

  function fechar(msg?: string) {
    setJanela(null);
    if (msg) {
      mostrar(msg);
      dados.recarregar();
    }
  }
  const filtrado = !!(sistema || busca || situacao !== "venda");

  return (
    <div className="space-y-4">
      <Cabecalho
        titulo="Pacotes de licença"
        descricao="Monte o que cada sistema vende: módulos, preço, quantos usuários entram e o que acontece quando passa do limite."
      >
        <BotoesExportar
          vazio={!lista.length}
          avisar={mostrar}
          montar={() => ({
            titulo: "Pacotes de licença",
            subtitulo: `${org.nome} · ${sistema ? nomeSistema(sistema) : "todos os sistemas"} · ${plural(lista.length, "pacote")} · ${fmtData(hoje)}`,
            arquivo: nomeArquivo("Pacotes-licenca", hoje),
            logoUrl: org.logo_url,
            paisagem: true,
            linhas: lista,
            colunas: [
              { titulo: "Pacote", valor: (p) => p.nome, peso: 1.5, largura: 22 },
              { titulo: "Sistema", valor: (p) => nomeSistema(p.sistema), peso: 1, largura: 14 },
              { titulo: "Módulos", valor: (p) => nomesModulos(p).join(", "), peso: 3, largura: 50 },
              { titulo: "Usuários", valor: (p) => textoUsuariosPacote(p.usuarios_incluidos), peso: 1.2, largura: 20 },
              { titulo: "Passou do limite", valor: (p) => (p.usuarios_incluidos == null ? "—" : p.excedente === "bloquear" ? "Bloqueia" : "Cobra"), peso: 1, largura: 14 },
              ...(podeGerir
                ? [
                    { titulo: "Preço mensal", valor: (p: Plano) => p.preco, formato: "moeda" as const, peso: 1.1 },
                    { titulo: "Usuário a mais", valor: (p: Plano) => p.valor_usuario_adicional, formato: "moeda" as const, peso: 1.1 },
                    { titulo: "Avulsos somariam", valor: (p: Plano) => resumo(p).avulsos, formato: "moeda" as const, peso: 1.1 },
                  ]
                : []),
              { titulo: "Licenças ativas", valor: (p) => emUso(p.id), formato: "numero", peso: 0.9 },
              { titulo: "Situação", valor: (p) => (p.ativo ? "À venda" : "Fora de venda"), peso: 1, largura: 14 },
            ],
          })}
        />
        {podeGerir && (
          <button className="btn-primario" onClick={() => setJanela("novo")}>
            <Icone nome="mais" className="h-4 w-4" /> Montar pacote
          </button>
        )}
      </Cabecalho>

      <div className="cartao flex flex-wrap items-end gap-3 p-3">
        <label className="campo">
          <span>Sistema</span>
          <select value={sistema} onChange={(e) => setSistema(e.target.value)}>
            <option value="">Todos</option>
            {(d?.sistemas ?? []).map((x) => (
              <option key={x.slug} value={x.slug}>
                {x.nome}
              </option>
            ))}
          </select>
        </label>
        <label className="campo">
          <span>Situação</span>
          <select value={situacao} onChange={(e) => setSituacao(e.target.value as Situacao)}>
            <option value="venda">À venda</option>
            <option value="fora">Fora de venda</option>
            <option value="todos">Todos</option>
          </select>
        </label>
        <label className="campo min-w-48 flex-1">
          <span>Buscar</span>
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Nome do pacote ou módulo" />
        </label>
        {filtrado && (
          <button
            className="btn min-h-10 text-sm"
            onClick={() => {
              setSistema("");
              setBusca("");
              setSituacao("venda");
            }}
          >
            <Icone nome="cancelar" className="h-4 w-4" /> Limpar filtros
          </button>
        )}
        {podeGerir && (
          <div className="ml-auto flex gap-1" role="group" aria-label="Como ver">
            {(
              [
                ["cartoes", "Cartões", "grade"],
                ["grade", "Grade módulo × pacote", "planilha"],
              ] as const
            ).map(([v, t, ic]) => (
              <button key={v} className={`btn !min-h-10 ${vista === v ? "!border-[var(--marca)] !text-[var(--marca)]" : ""}`} aria-pressed={vista === v} onClick={() => setVista(v)}>
                <Icone nome={ic} className="h-4 w-4" /> {t}
              </button>
            ))}
          </div>
        )}
      </div>

      {aviso}

      {!d ? (
        <Carregando />
      ) : vista === "grade" && podeGerir ? (
        <QuadroPacotes
          produtos={d.produtos}
          planos={d.planos}
          org={org.id}
          emUso={emUso}
          aoEditar={(p) => setJanela(p)}
          aoSalvar={(m) => fechar(m)}
          nomeSistema={nomeSistema}
        />
      ) : !lista.length ? (
        <EstadoVazio
          acao={
            podeGerir &&
            !filtrado && (
              <button className="btn-primario" onClick={() => setJanela("novo")}>
                <Icone nome="mais" className="h-4 w-4" /> Montar o primeiro pacote
              </button>
            )
          }
        >
          {filtrado
            ? "Nenhum pacote com estes filtros. Mude o sistema ou a situação, ou limpe os filtros."
            : "Nenhum pacote ainda. Um pacote junta módulos de um sistema com um preço e um número de usuários."}
        </EstadoVazio>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {lista.map((p) => {
            const r = resumo(p);
            const uso = emUso(p.id);
            return (
              <article key={p.id} className="cartao flex flex-col gap-2 p-4">
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <h2 className="font-semibold text-[var(--marca)]">{p.nome}</h2>
                    {p.descricao && <p className="text-sm text-neutral-600">{p.descricao}</p>}
                  </div>
                  <Chip tom={p.ativo ? "verde" : "neutro"}>{p.ativo ? "À venda" : "Fora de venda"}</Chip>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <Chip tom="azul">{nomeSistema(p.sistema)}</Chip>
                  <span className="chip bg-[var(--fundo)] text-neutral-800">
                    <Icone nome="pessoas" className="h-3.5 w-3.5" /> {textoUsuariosPacote(p.usuarios_incluidos)}
                  </span>
                </div>
                <ul className="flex flex-wrap gap-1 text-xs text-neutral-700">
                  {nomesModulos(p).map((n) => (
                    <li key={n} className="rounded-md border border-neutral-200 px-1.5 py-0.5">
                      {n}
                    </li>
                  ))}
                </ul>
                {p.usuarios_incluidos != null && (
                  <p className="text-xs text-neutral-600">{podeGerir ? textoExcedente(p.excedente, p.valor_usuario_adicional, brl) : p.excedente === "bloquear" ? "Passou do limite: bloqueia" : "Passou do limite: cobra no mês seguinte"}</p>
                )}
                <div className="mt-auto flex flex-wrap items-end justify-between gap-2 border-t border-neutral-100 pt-2">
                  <div className="text-sm">
                    {podeGerir && (
                      <p>
                        <strong className="text-base tabular-nums">{brl(p.preco)}</strong> por mês
                        {r.desconto > 0 && <span className="text-xs text-neutral-500"> · {r.desconto.toLocaleString("pt-BR")}% sobre os avulsos ({brl(r.avulsos)})</span>}
                      </p>
                    )}
                    <p className="text-xs text-neutral-500">{plural(uso, "licença ativa", "licenças ativas")}</p>
                  </div>
                  {podeGerir && (
                    <button className="btn" onClick={() => setJanela(p)}>
                      <Icone nome="editar" className="h-4 w-4" /> Editar
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}

      {janela && d && (
        <JanelaPacote
          pacote={janela === "novo" ? null : janela}
          produtos={d.produtos}
          sistemas={d.sistemas}
          sistemaInicial={sistema || undefined}
          emUso={janela === "novo" ? 0 : emUso(janela.id)}
          org={org.id}
          aoFechar={() => fechar()}
          aoSalvar={fechar}
        />
      )}
    </div>
  );
}
