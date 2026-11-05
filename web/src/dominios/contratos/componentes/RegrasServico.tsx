// Contratos › Regras fiscais › Tipos de serviço (057): uma regra por tipo de serviço da LC 116 (código da NFS-e) com
// NBS, ISS, retenção do ISS e a classificação IBS/CBS da reforma. A nota da fatura, o contrato e o item de serviço leem
// daqui. Lista com PDF e Excel; "+ Nova regra" e Editar abrem a janela; Inativar pede motivo (nada se apaga).
"use client";

import { useState } from "react";
import { BotoesExportar } from "@/components/ui/BotoesExportar";
import { CampoNbs, CampoServico } from "@/components/ui/CampoServico";
import { Chip } from "@/components/ui/Chip";
import { EstadoVazio } from "@/components/ui/EstadoVazio";
import { Icone } from "@/components/ui/Icone";
import { JanelaMotivo } from "@/components/ui/JanelaMotivo";
import { Modal } from "@/components/ui/Modal";
import { QuadroTabela } from "@/components/ui/QuadroTabela";
import { ColunaFormulario, ColunasFormulario } from "@/components/ui/ColunasFormulario";
import type { TomAviso } from "@/components/ui/Aviso";
import { nomeArquivo } from "@/lib/arquivos/exportarLista";
import { traduzirErro } from "@/lib/erros";
import { descricaoLc116, formatarCodigoNacional, formatarNbs, subitemDoCodigo } from "@/lib/fiscal/servicos";
import { plural } from "@/lib/formato/numero";
import { salvarRegraServico } from "../repositorio";
import { municipiosDoTexto, nomeMunicipio, RETENCOES } from "../regrasFiscais";
import type { RegraServico } from "../tipos";

export function RegrasServico({
  cliente,
  nomeEmpresa,
  logoUrl,
  hoje,
  regras,
  podeGerir,
  avisar,
  aoMudar,
}: {
  cliente: string;
  nomeEmpresa: string;
  logoUrl: string | null;
  hoje: string;
  regras: RegraServico[];
  podeGerir: boolean;
  avisar: (texto: string, tom?: TomAviso) => void;
  aoMudar: () => void;
}) {
  const [inativas, setInativas] = useState(false);
  const [editar, setEditar] = useState<RegraServico | "nova" | null>(null);
  const [inativar, setInativar] = useState<RegraServico | null>(null);
  const lista = regras.filter((r) => inativas || r.ativo);
  const nInativas = regras.filter((r) => !r.ativo).length;
  const desc = (r: RegraServico) => descricaoLc116(subitemDoCodigo(r.servico_codigo)) ?? "";

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-semibold">Regras por tipo de serviço</h2>
          <p className="text-sm text-[var(--texto-suave)]">
            Uma regra para cada serviço que a MDC presta (LC 116). O contrato e o item de serviço escolhem o tipo; a nota usa o NBS e
            confere a retenção do ISS daqui.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <BotoesExportar
            vazio={!lista.length}
            avisar={avisar}
            montar={() => ({
              titulo: "Regras fiscais por tipo de serviço",
              subtitulo: `${nomeEmpresa} · ${plural(lista.length, "regra")}`,
              arquivo: nomeArquivo("Regras-fiscais", nomeEmpresa, hoje),
              logoUrl,
              paisagem: true,
              linhas: lista,
              colunas: [
                {
                  titulo: "Código NFS-e",
                  valor: (r: RegraServico) => formatarCodigoNacional(r.servico_codigo) ?? "",
                  peso: 0.8,
                  largura: 12,
                },
                { titulo: "Serviço (LC 116)", valor: desc, peso: 2.2, largura: 50 },
                { titulo: "Nome", valor: (r: RegraServico) => r.nome, peso: 1.3, largura: 26 },
                { titulo: "NBS", valor: (r: RegraServico) => (r.nbs ? formatarNbs(r.nbs) : "padrão"), peso: 0.9, largura: 14 },
                {
                  titulo: "ISS (%)",
                  valor: (r: RegraServico) => (r.iss_aliquota != null ? String(Number(r.iss_aliquota)).replace(".", ",") : ""),
                  peso: 0.5,
                  largura: 8,
                },
                {
                  titulo: "Retenção do ISS",
                  valor: (r: RegraServico) =>
                    r.iss_retencao === "municipios"
                      ? `Retém em ${r.iss_retencao_municipios.map(nomeMunicipio).join(", ")}`
                      : (RETENCOES.find((x) => x.id === r.iss_retencao)?.nome ?? ""),
                  peso: 1.4,
                  largura: 30,
                },
                { titulo: "IBS/CBS cClassTrib", valor: (r: RegraServico) => r.cclasstrib ?? "", peso: 0.7, largura: 12 },
                {
                  titulo: "Situação",
                  valor: (r: RegraServico) => (r.ativo ? "Ativa" : `Inativa: ${r.inativo_motivo ?? ""}`),
                  peso: 0.8,
                  largura: 20,
                },
              ],
            })}
          />
          {podeGerir && (
            <button className="btn-primario" onClick={() => setEditar("nova")}>
              <Icone nome="mais" className="h-4 w-4" />
              Nova regra
            </button>
          )}
        </div>
      </div>
      {nInativas > 0 && (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={inativas} onChange={(e) => setInativas(e.target.checked)} />
          Mostrar inativas ({nInativas})
        </label>
      )}

      {!lista.length ? (
        <EstadoVazio icone="documento" titulo="Nenhuma regra por tipo de serviço ainda">
          {podeGerir
            ? "Clique em “Nova regra” e escolha o serviço da LC 116 (ex.: 17.19 Contabilidade). Informe o NBS, o ISS e se o cliente retém o ISS. A nota de cada fatura passa a seguir a regra."
            : "Peça a quem gere o módulo Contratos para cadastrar as regras dos serviços da MDC."}
        </EstadoVazio>
      ) : (
        <QuadroTabela rotulo="Regras por tipo de serviço">
          <thead>
            <tr>
              <th>Serviço</th>
              <th>NBS e ISS</th>
              <th>Retenção do ISS</th>
              <th>IBS/CBS</th>
              <th>Situação</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {lista.map((r) => (
              <tr key={r.id} className={r.ativo ? "" : "linha-apagada"}>
                <td className="celula-titulo min-w-64">
                  {r.nome}
                  <span className="block text-xs font-normal text-[var(--texto-suave)]">
                    {formatarCodigoNacional(r.servico_codigo)} · {desc(r)}
                  </span>
                </td>
                <td data-rotulo="NBS e ISS" className="whitespace-nowrap text-sm">
                  {r.nbs ? formatarNbs(r.nbs) : "NBS padrão"}
                  <span className="block text-xs text-[var(--texto-suave)]">
                    {r.iss_aliquota != null ? `ISS ${String(Number(r.iss_aliquota)).replace(".", ",")}%` : "ISS não informado"}
                  </span>
                </td>
                <td data-rotulo="Retenção" className="text-sm">
                  {r.iss_retencao === "nao" ? (
                    <Chip tom="verde">Não retém</Chip>
                  ) : r.iss_retencao === "sempre" ? (
                    <Chip tom="ambar">Sempre retém</Chip>
                  ) : (
                    <>
                      <Chip tom="ambar">Retém em municípios</Chip>
                      <span className="mt-1 block text-xs text-[var(--texto-suave)]">
                        {r.iss_retencao_municipios.map(nomeMunicipio).join(", ")}
                      </span>
                    </>
                  )}
                </td>
                <td data-rotulo="IBS/CBS" className="whitespace-nowrap text-sm">
                  {r.cclasstrib ? `cClassTrib ${r.cclasstrib}` : "—"}
                  {r.cindop && <span className="block text-xs text-[var(--texto-suave)]">cIndOp {r.cindop}</span>}
                </td>
                <td data-rotulo="Situação">
                  {r.ativo ? <Chip tom="verde">Ativa</Chip> : <Chip tom="neutro">Inativa</Chip>}
                  {!r.ativo && r.inativo_motivo && <span className="block text-xs text-[var(--texto-suave)]">{r.inativo_motivo}</span>}
                </td>
                <td className="celula-acoes whitespace-nowrap text-right">
                  {podeGerir && r.ativo && (
                    <>
                      <button className="btn !min-h-8 !px-3" onClick={() => setEditar(r)}>
                        <Icone nome="editar" className="h-4 w-4" />
                        Editar
                      </button>
                      <button className="btn ml-2 !min-h-8 !px-3 text-[var(--perigo)]" onClick={() => setInativar(r)}>
                        Inativar
                      </button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </QuadroTabela>
      )}

      {editar && (
        <JanelaRegra
          cliente={cliente}
          regra={editar === "nova" ? null : editar}
          aoFechar={() => setEditar(null)}
          aoSalvar={(msg) => {
            setEditar(null);
            avisar(msg);
            aoMudar();
          }}
        />
      )}
      {inativar && (
        <JanelaMotivo
          titulo={`Inativar a regra ${inativar.nome}`}
          descricao="A regra sai da lista e a nota deste serviço volta a usar o NBS padrão, sem conferir retenção. Nada é apagado: o histórico fica na auditoria."
          botao="Inativar"
          aoFechar={() => setInativar(null)}
          aoConfirmar={async (motivo) => {
            await salvarRegraServico({ ...paraSalvar(inativar, cliente), ativo: false, motivo });
            setInativar(null);
            avisar("Regra inativada.");
            aoMudar();
          }}
        />
      )}
    </section>
  );
}

function paraSalvar(r: RegraServico, cliente: string) {
  return {
    id: r.id,
    cliente,
    servico_codigo: r.servico_codigo,
    nome: r.nome,
    descricao_nota: r.descricao_nota,
    nbs: r.nbs,
    iss_aliquota: r.iss_aliquota,
    iss_retencao: r.iss_retencao,
    iss_retencao_municipios: r.iss_retencao_municipios.map(nomeMunicipio),
    cclasstrib: r.cclasstrib,
    cindop: r.cindop,
  };
}

function JanelaRegra({
  cliente,
  regra,
  aoFechar,
  aoSalvar,
}: {
  cliente: string;
  regra: RegraServico | null;
  aoFechar: () => void;
  aoSalvar: (msg: string) => void;
}) {
  const [codigo, setCodigo] = useState(regra ? (formatarCodigoNacional(regra.servico_codigo) ?? "") : "");
  const [nome, setNome] = useState(regra?.nome ?? "");
  const [descricao, setDescricao] = useState(regra?.descricao_nota ?? "");
  const [nbs, setNbs] = useState(regra?.nbs ?? "");
  const [iss, setIss] = useState(regra?.iss_aliquota != null ? String(Number(regra.iss_aliquota)).replace(".", ",") : "");
  const [retencao, setRetencao] = useState<RegraServico["iss_retencao"]>(regra?.iss_retencao ?? "nao");
  const [municipios, setMunicipios] = useState((regra?.iss_retencao_municipios ?? []).map(nomeMunicipio).join("; "));
  const [cclasstrib, setCclasstrib] = useState(regra?.cclasstrib ?? "");
  const [cindop, setCindop] = useState(regra?.cindop ?? "");
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);

  async function salvar() {
    setErro("");
    if (!formatarCodigoNacional(codigo)) return setErro("Escolha o tipo de serviço da LC 116.");
    if (nome.trim().length < 2) return setErro("Dê um nome à regra (ex.: Honorários contábeis).");
    const issN = iss.trim() ? Number(iss.replace(",", ".")) : null;
    if (issN !== null && !(issN >= 0 && issN <= 5)) return setErro("O ISS vai de 0% a 5% (ex.: 2).");
    const lista = municipiosDoTexto(municipios);
    if (retencao === "municipios" && !lista.length) return setErro("Escreva os municípios que retêm, como Cidade/UF (ex.: Atibaia/SP).");
    if (cclasstrib.trim() && cclasstrib.replace(/\D/g, "").length !== 6) return setErro("cClassTrib (IBS/CBS): 6 números.");
    if (cindop.trim() && cindop.replace(/\D/g, "").length !== 6) return setErro("Indicador de operação (IBS/CBS): 6 números.");
    setSalvando(true);
    try {
      await salvarRegraServico({
        id: regra?.id,
        cliente,
        servico_codigo: codigo,
        nome: nome.trim(),
        descricao_nota: descricao.trim() || null,
        nbs: nbs || null,
        iss_aliquota: issN,
        iss_retencao: retencao,
        iss_retencao_municipios: retencao === "municipios" ? lista : [],
        cclasstrib: cclasstrib.trim() || null,
        cindop: cindop.trim() || null,
      });
      aoSalvar(regra ? "Regra fiscal atualizada. As próximas notas deste serviço já seguem a regra." : "Regra fiscal cadastrada.");
    } catch (e) {
      setErro(traduzirErro(e));
      setSalvando(false);
    }
  }

  return (
    <Modal
      titulo={regra ? `Editar regra: ${regra.nome}` : "Nova regra fiscal"}
      descricao="Escolha o serviço da LC 116 e diga como ele é tributado. A nota de cada fatura com este serviço segue a regra."
      aoFechar={aoFechar}
      largura="5xl"
      avisoRodape={
        erro && (
          <p role="alert" className="rounded-md bg-red-50 p-2 text-sm text-red-800">
            {erro}
          </p>
        )
      }
      rodape={
        <>
          <button className="btn" onClick={aoFechar}>
            Voltar
          </button>
          <button className="btn-primario" onClick={salvar} disabled={salvando}>
            {salvando ? "Salvando…" : "Salvar regra"}
          </button>
        </>
      }
    >
      <ColunasFormulario>
        <ColunaFormulario>
          <fieldset className="space-y-3 rounded-md border border-[var(--borda)] p-3">
            <legend className="px-1 text-sm font-medium">1. Qual serviço</legend>
            <CampoServico
              valor={codigo}
              obrigatorio
              aoMudar={(c, d) => {
                setCodigo(c);
                if (d && !nome.trim()) setNome(d.split(",")[0].slice(0, 120));
                if (d && !descricao.trim()) setDescricao(d);
              }}
            />
            <label className="campo">
              <span>Nome da regra</span>
              <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Honorários contábeis" required />
            </label>
            <label className="campo">
              <span>Texto padrão na nota (opcional)</span>
              <textarea
                rows={2}
                value={descricao}
                onChange={(e) => setDescricao(e.target.value)}
                placeholder="Ex.: Serviços de contabilidade, escrituração fiscal e folha de pagamento"
              />
              <small className="text-xs text-[var(--texto-suave)]">
                O contrato novo deste serviço já vem com este texto (dá para mudar no contrato).
              </small>
            </label>
          </fieldset>
          <fieldset className="space-y-3 rounded-md border border-[var(--borda)] p-3">
            <legend className="px-1 text-sm font-medium">2. NBS e ISS</legend>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="sm:col-span-2">
                <CampoNbs valor={nbs} aoMudar={setNbs} />
              </div>
              <label className="campo">
                <span>ISS (%)</span>
                <input value={iss} onChange={(e) => setIss(e.target.value)} inputMode="decimal" placeholder="Ex.: 2" />
                <small className="text-xs text-[var(--texto-suave)]">Do município, de 0% a 5%. No Simples vai no DAS.</small>
              </label>
            </div>
          </fieldset>
        </ColunaFormulario>
        <ColunaFormulario>
          <fieldset className="space-y-2 rounded-md border border-[var(--borda)] p-3">
            <legend className="px-1 text-sm font-medium">3. Retenção do ISS pelo cliente</legend>
            <div role="radiogroup" aria-label="Retenção do ISS" className="space-y-2">
              {RETENCOES.map((o) => (
                <label
                  key={o.id}
                  className={`flex cursor-pointer gap-3 rounded-xl border p-3 text-sm ${retencao === o.id ? "border-[var(--marca)] bg-[var(--fundo)]" : "border-[var(--borda)]"}`}
                >
                  <input type="radio" name="retencao" className="mt-1" checked={retencao === o.id} onChange={() => setRetencao(o.id)} />
                  <span>
                    <span className="block font-medium">{o.nome}</span>
                    <span className="block text-xs text-[var(--texto-suave)]">{o.detalhe}</span>
                  </span>
                </label>
              ))}
            </div>
            {retencao === "municipios" && (
              <label className="campo">
                <span>Municípios que retêm (Cidade/UF, separados por ponto e vírgula)</span>
                <textarea
                  rows={2}
                  value={municipios}
                  onChange={(e) => setMunicipios(e.target.value)}
                  placeholder="Ex.: Atibaia/SP; Jundiaí/SP"
                />
                <small className="text-xs text-[var(--texto-suave)]">
                  O HUB compara com a cidade e a UF do cadastro do cliente (sem ligar para acento).
                </small>
              </label>
            )}
            {retencao !== "nao" && (
              <p className="rounded-md bg-amber-50 p-2 text-xs text-amber-900">
                Quando o ISS for retido, o HUB avisa na fatura e não emite a nota sozinho: emita essa pelo Emissor Nacional. Nas demais,
                segue normal.
              </p>
            )}
          </fieldset>
          <fieldset className="space-y-3 rounded-md border border-[var(--borda)] p-3">
            <legend className="px-1 text-sm font-medium">4. Reforma tributária (IBS/CBS), opcional</legend>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="campo">
                <span>cClassTrib</span>
                <input
                  value={cclasstrib}
                  onChange={(e) => setCclasstrib(e.target.value)}
                  inputMode="numeric"
                  placeholder="6 números"
                  maxLength={6}
                />
              </label>
              <label className="campo">
                <span>Indicador de operação (cIndOp)</span>
                <input
                  value={cindop}
                  onChange={(e) => setCindop(e.target.value)}
                  inputMode="numeric"
                  placeholder="6 números"
                  maxLength={6}
                />
              </label>
            </div>
            <small className="block text-xs text-[var(--texto-suave)]">
              Classificação do serviço para IBS e CBS. Fica guardada para quando a nota nacional passar a pedir; hoje ainda não vai na nota.
            </small>
          </fieldset>
        </ColunaFormulario>
      </ColunasFormulario>
    </Modal>
  );
}
