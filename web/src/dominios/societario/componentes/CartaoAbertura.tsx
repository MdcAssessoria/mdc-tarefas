// Cartão "Ficha de abertura" na tela do processo de abertura (112): resumo da ficha, conferência (o que o regime não
// aceita, o que pede atenção e o que falta), quadro societário com Excel/PDF e os documentos esperados, marcando o
// tipo de cada anexo do processo (RG/CNH, comprovante, IPTU…). Ficha e sócios abrem nas janelas próprias.
"use client";

import { useCallback, useState } from "react";
import { supabase } from "@/lib/supabase";
import { traduzirErro } from "@/lib/erros";
import { formatarDocumento } from "@/lib/documento";
import { useConsulta } from "@/lib/useConsulta";
import type { Arquivo } from "@/lib/arquivos/armazenamento";
import { BotoesExportar } from "@/components/ui/BotoesExportar";
import { Chip } from "@/components/ui/Chip";
import { Icone } from "@/components/ui/Icone";
import { useConfirmar } from "@/components/ui/JanelaConfirmar";
import { conferirAbertura, documentosEsperados, nomeDe, quotas, resumoFicha, somaPercentuais, TIPOS_DOC } from "../abertura";
import type { SocioAbertura, TipoDocAbertura } from "../abertura";
import { lerAbertura } from "../leituras";
import { JanelaFichaAbertura } from "./JanelaFichaAbertura";
import { JanelaSocio } from "./JanelaSocio";

const pct = (n: number) => `${String(Number(n)).replace(".", ",")}%`;

export function CartaoAbertura({
  processoId,
  numero,
  padrao,
  arquivos,
  podeOperar,
  aberto,
  logoUrl,
  mostrar,
  aoMudar,
}: {
  processoId: string;
  numero: number;
  padrao: { razao: string; uf: string };
  arquivos: Arquivo[];
  podeOperar: boolean;
  aberto: boolean;
  logoUrl?: string | null;
  mostrar: (texto: string, tom?: "erro" | "sucesso" | "atencao") => void;
  /** A ficha mudou o cabeçalho do processo (nome da futura empresa, UF): recarrega a ficha do processo. */
  aoMudar: () => void;
}) {
  const consulta = useConsulta(useCallback(() => lerAbertura(processoId), [processoId]));
  const [ficha, setFicha] = useState(false);
  const [socio, setSocio] = useState<{ s: SocioAbertura | null } | null>(null);
  const [janelaConfirmar, confirmar] = useConfirmar();
  const recarregar = consulta.recarregar;
  const editar = podeOperar && aberto;

  if (!consulta.dados)
    return (
      <section className="cartao p-4 text-sm text-[var(--texto-suave)]" aria-label="Ficha de abertura">
        {consulta.erro ?? "Carregando a ficha de abertura…"}
      </section>
    );

  const { ficha: f, socios, docs, restricoes } = consulta.dados;
  const conf = conferirAbertura(f, socios, restricoes);
  const esperados = documentosEsperados(f, socios, docs);
  const completa = !!f && !conf.bloqueios.length && !conf.faltas.length && esperados.every((d) => d.ok);
  const tipoDoArquivo = new Map(docs.map((d) => [d.arquivo_id, d]));

  async function tipar(a: Arquivo, valor: string) {
    const [tipo, socioId] = valor.split("|");
    const { error } = await supabase().rpc("soc_abertura_documento_tipar", {
      p_arquivo: a.id,
      p_tipo: (tipo || null) as TipoDocAbertura | null,
      p_socio: socioId || null,
    });
    if (error) return mostrar(traduzirErro(error), "erro");
    recarregar();
  }

  async function excluirSocio(s: SocioAbertura) {
    const ok = await confirmar({
      titulo: `Retirar ${s.nome} do quadro?`,
      descricao: "O sócio sai da ficha de abertura; a retirada fica na linha do tempo do processo.",
      botao: "Excluir sócio",
      perigo: true,
    });
    if (!ok) return;
    const { error } = await supabase().rpc("soc_abertura_socio_excluir", { p_socio: s.id });
    if (error) return mostrar(traduzirErro(error), "erro");
    mostrar("Sócio retirado.");
    recarregar();
    aoMudar();
  }

  const titulo = f?.razao_social ?? padrao.razao;

  return (
    <section className="cartao space-y-4 p-4" aria-label="Ficha de abertura">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="flex items-center gap-2 font-semibold text-[var(--marca)]">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-[var(--fundo)]" aria-hidden="true">
            <Icone nome="documento" className="h-4 w-4" />
          </span>
          Ficha de abertura
        </h2>
        {completa ? <Chip tom="verde">Completa</Chip> : conf.bloqueios.length ? <Chip tom="vermelho">Não fecha</Chip> : <Chip tom="ambar">Em preenchimento</Chip>}
        <div className="ml-auto flex flex-wrap gap-2">
          {f && (
            <BotoesExportar
              vazio={false}
              avisar={mostrar}
              montar={() => ({
                titulo: `Ficha de abertura · ${titulo}`,
                subtitulo: `Processo societário #${numero}`,
                arquivo: `ficha-abertura-${numero}`,
                paisagem: false,
                logoUrl,
                colunas: [
                  { titulo: "Campo", valor: (l: [string, string]) => l[0], peso: 1, largura: 22 },
                  { titulo: "Informação", valor: (l: [string, string]) => l[1], peso: 3, largura: 90 },
                ],
                linhas: [
                  ...resumoFicha(f),
                  ...socios.map(
                    (s): [string, string] => [
                      `Sócio ${s.ordem}`,
                      `${s.nome} · ${s.documento ? formatarDocumento(s.documento) : "sem documento"} · ${pct(s.percentual)}${
                        quotas(f.capital_social, f.valor_quota, s.percentual) != null ? ` (${quotas(f.capital_social, f.valor_quota, s.percentual)!.toLocaleString("pt-BR")} quotas)` : ""
                      }${s.administrador ? " · administrador" : ""}`,
                    ],
                  ),
                ],
              })}
            />
          )}
          {editar && (
            <button className="btn" onClick={() => setFicha(true)}>
              <Icone nome={f ? "editar" : "mais"} className="h-4 w-4" />
              {f ? "Editar ficha" : "Preencher ficha"}
            </button>
          )}
        </div>
      </div>

      {!f ? (
        <p className="rounded-lg bg-[var(--fundo)] px-3 py-3 text-sm text-[var(--texto-suave)]">
          Comece pelo regime (Simples, Presumido ou Real): os CNAE são conferidos com ele. Depois inclua os sócios e anexe os
          documentos de cada um.
        </p>
      ) : (
        <dl className="grid gap-x-4 gap-y-2 text-sm sm:grid-cols-2 xl:grid-cols-3">
          {resumoFicha(f)
            .filter(([r]) => r !== "Objeto social")
            .map(([r, v]) => (
              <div key={r} className="min-w-0">
                <dt className="text-xs text-[var(--texto-suave)]">{r}</dt>
                <dd className="break-words">{v}</dd>
              </div>
            ))}
        </dl>
      )}

      {(conf.bloqueios.length > 0 || conf.avisos.length > 0 || (f && conf.faltas.length > 0)) && (
        <ul className="space-y-1 text-sm" aria-label="Conferência da ficha">
          {conf.bloqueios.map((t) => (
            <li key={t} className="flex gap-2 rounded-md bg-red-50 px-3 py-2 text-red-800">
              <Icone nome="alerta" className="mt-0.5 h-4 w-4 shrink-0" />
              {t}
            </li>
          ))}
          {conf.avisos.map((t) => (
            <li key={t} className="flex gap-2 rounded-md bg-amber-50 px-3 py-2 text-amber-900">
              <Icone nome="info" className="mt-0.5 h-4 w-4 shrink-0" />
              {t}
            </li>
          ))}
          {f &&
            conf.faltas.map((t) => (
              <li key={t} className="flex gap-2 rounded-md bg-[var(--fundo)] px-3 py-2">
                <Icone nome="relogio" className="mt-0.5 h-4 w-4 shrink-0 text-[var(--texto-suave)]" />
                {t}
              </li>
            ))}
        </ul>
      )}

      <div>
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <h3 className="text-sm font-semibold">Quadro societário</h3>
          <span className={`text-sm ${socios.length && somaPercentuais(socios) !== 100 ? "text-red-700" : "text-[var(--texto-suave)]"}`}>
            {socios.length ? `${pct(somaPercentuais(socios))} do capital` : "nenhum sócio"}
          </span>
          {editar && (
            <button className="btn ml-auto" onClick={() => setSocio({ s: null })}>
              <Icone nome="mais" className="h-4 w-4" />
              Novo sócio
            </button>
          )}
        </div>
        {socios.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-[var(--texto-suave)]">
                  <th className="py-1 pr-3 font-medium">Sócio</th>
                  <th className="py-1 pr-3 font-medium">CPF/CNPJ</th>
                  <th className="py-1 pr-3 text-right font-medium">Participação</th>
                  <th className="py-1 pr-3 font-medium">Função</th>
                  {editar && <th className="py-1 font-medium">Ações</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--borda)]">
                {socios.map((s) => (
                  <tr key={s.id}>
                    <td className="py-1.5 pr-3">{s.nome}</td>
                    <td className="num py-1.5 pr-3">{s.documento ? formatarDocumento(s.documento) : "—"}</td>
                    <td className="num py-1.5 pr-3 text-right">{pct(s.percentual)}</td>
                    <td className="py-1.5 pr-3">{s.administrador ? <Chip tom="azul">Administrador</Chip> : "Sócio"}</td>
                    {editar && (
                      <td className="whitespace-nowrap py-1.5">
                        <button className="btn !min-h-8 !px-2.5" onClick={() => setSocio({ s })}>
                          <Icone nome="editar" className="h-4 w-4" />
                          Editar
                        </button>{" "}
                        <button className="btn !min-h-8 !px-2.5 text-[var(--perigo)]" onClick={() => excluirSocio(s)}>
                          <Icone nome="lixeira" className="h-4 w-4" />
                          Excluir
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {esperados.length > 0 && (
        <div>
          <h3 className="mb-2 text-sm font-semibold">Documentos da abertura</h3>
          <ul className="grid gap-1 text-sm sm:grid-cols-2">
            {esperados.map((d) => (
              <li key={`${d.tipo}|${d.socio_id ?? ""}`} className="flex items-center gap-2">
                <Icone nome={d.ok ? "check" : "relogio"} className={`h-4 w-4 shrink-0 ${d.ok ? "text-emerald-700" : "text-[var(--texto-suave)]"}`} />
                <span className={d.ok ? "" : "text-[var(--texto-suave)]"}>{d.rotulo}</span>
              </li>
            ))}
          </ul>
          {arquivos.length > 0 ? (
            <div className="mt-3 space-y-2">
              <p className="text-xs text-[var(--texto-suave)]">Diga o que é cada anexo do processo (o envio continua no cartão Documentos):</p>
              {arquivos.map((a) => {
                const t = tipoDoArquivo.get(a.id);
                return (
                  <label key={a.id} className="grid items-center gap-2 text-sm sm:grid-cols-[minmax(0,1fr)_18rem]">
                    <span className="truncate" title={a.nome}>
                      <Icone nome="clipe" className="mr-1 inline h-3.5 w-3.5" />
                      {a.nome}
                    </span>
                    <select
                      disabled={!editar}
                      value={t ? `${t.tipo}|${t.socio_id ?? ""}` : ""}
                      onChange={(e) => tipar(a, e.target.value)}
                      aria-label={`Tipo do documento ${a.nome}`}
                    >
                      <option value="">Sem tipo</option>
                      {TIPOS_DOC.flatMap((x) =>
                        x.doSocio && socios.length
                          ? socios.map((s) => (
                              <option key={`${x.id}|${s.id}`} value={`${x.id}|${s.id}`}>
                                {x.nome} · {s.nome}
                              </option>
                            ))
                          : [
                              <option key={x.id} value={`${x.id}|`}>
                                {nomeDe(TIPOS_DOC, x.id)}
                              </option>,
                            ],
                      )}
                    </select>
                  </label>
                );
              })}
            </div>
          ) : (
            <p className="mt-2 text-xs text-[var(--texto-suave)]">Anexe os documentos no cartão Documentos e depois marque o tipo aqui.</p>
          )}
        </div>
      )}

      {janelaConfirmar}
      {ficha && (
        <JanelaFichaAbertura
          processoId={processoId}
          ficha={f}
          socios={socios}
          restricoes={restricoes}
          padrao={padrao}
          aoFechar={() => setFicha(false)}
          aoSalvar={() => {
            setFicha(false);
            mostrar("Ficha de abertura salva.");
            recarregar();
            aoMudar();
          }}
        />
      )}
      {socio && (
        <JanelaSocio
          processoId={processoId}
          socio={socio.s}
          outros={socios.filter((x) => x.id !== socio.s?.id)}
          aoFechar={() => setSocio(null)}
          aoSalvar={() => {
            setSocio(null);
            mostrar("Sócio salvo.");
            recarregar();
          }}
        />
      )}
    </section>
  );
}
