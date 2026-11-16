// Janela "Contrato" de uma licença (Licenças › Licenças › Ações › Contrato). Sem contrato: quem assina pelo cliente,
// como vai assinar (papel ou link), prévia em PDF (MINUTA) e Emitir. Com contrato: situação, PDF, link de assinatura
// (copiar ou WhatsApp), registrar a assinatura em papel e cancelar com motivo. Exige a permissão de valores (gerir),
// porque o texto traz o preço. Regras do texto em ../contratoLicenca.ts; banco na migração 085.
"use client";

import { origemPublica } from "@/lib/caminho";
import { useCallback, useState } from "react";
import { useOrg } from "@/dominios/organizacao/OrgProvider";
import { useConsulta } from "@/lib/useConsulta";
import { traduzirErro } from "@/lib/erros";
import { fmtData, fmtDataHora } from "@/lib/formato/datas";
import { saudacao } from "@/lib/datas";
import { Modal } from "@/components/ui/Modal";
import { Carregando } from "@/components/ui/Carregando";
import { Chip } from "@/components/ui/Chip";
import { Icone } from "@/components/ui/Icone";
import { JanelaMotivo } from "@/components/ui/JanelaMotivo";
import { ColunaFormulario, ColunasFormulario } from "@/components/ui/ColunasFormulario";
import { CampoArquivo } from "@/components/ui/CampoArquivo";
import {
  ROTULO_SITUACAO,
  conferirSignatario,
  preencher,
  valoresDoContrato,
  type DocumentoLicenca,
  type ModoAssinatura,
  type Signatario,
} from "../contratoLicenca";
import {
  abrirContratoAssinado,
  anexarAssinado,
  enviarContratoAssinado,
  baixarContratoLicenca,
  cancelarDocumento,
  emitirDocumento,
  emailAssinatura,
  enderecoAssinatura,
  gerarLink,
  lerDocumentos,
  lerModelo,
  mensagemAssinatura,
  registrarAssinatura,
} from "../documentos";
import type { Contrato, Plano, Produto } from "../tipos";

interface Props {
  contrato: Contrato;
  produtos: Map<string, Produto>;
  planos: Map<string, Plano>;
  diasBloqueio: number;
  hoje: string;
  aoFechar: () => void;
  aoMudar: (msg: string) => void;
}

export function JanelaContratoLicenca(p: Props) {
  const { org, clientePorId } = useOrg();
  const consulta = useConsulta(
    useCallback(async () => {
      const [docs, modelo] = await Promise.all([lerDocumentos(p.contrato.id), lerModelo(org.id)]);
      return { docs, modelo };
    }, [p.contrato.id, org.id]),
  );
  const cli = clientePorId(p.contrato.cliente_id);
  const cliente = {
    razao_social: cli?.razao_social ?? "Cliente",
    cnpj: cli?.cnpj ?? null,
    cidade: cli?.cidade ?? null,
    uf: cli?.uf ?? null,
  };
  const atual = consulta.dados?.docs.find((d) => d.situacao !== "cancelado") ?? null;
  const cancelados = consulta.dados?.docs.filter((d) => d.situacao === "cancelado") ?? [];

  const titulo = "Contrato da licença";
  const descricao = `${cliente.razao_social} · um contrato por licença, no papel timbrado da MDC`;
  const historico =
    cancelados.length > 0 ? (
      <details className="text-sm text-neutral-600">
        <summary className="cursor-pointer">Contratos cancelados desta licença ({cancelados.length})</summary>
        <ul className="mt-2 space-y-1">
          {cancelados.map((d) => (
            <li key={d.id}>
              {d.numero} · emitido em {fmtData(d.emitido_em)} · cancelado em {fmtData(d.cancelado_em)}: {d.cancelado_motivo}
            </li>
          ))}
        </ul>
      </details>
    ) : null;

  if (!consulta.dados)
    return (
      <Modal titulo={titulo} descricao={descricao} aoFechar={p.aoFechar}>
        {consulta.erro ? <p className="rounded-md bg-red-50 p-2 text-sm text-red-800">{consulta.erro}</p> : <Carregando />}
      </Modal>
    );
  return atual ? (
    <ContratoEmitido
      org={org.id}
      clienteId={p.contrato.cliente_id}
      titulo={titulo}
      descricao={descricao}
      doc={atual}
      cliente={cliente}
      hoje={p.hoje}
      logo={org.logo_url}
      historico={historico}
      aoMudar={(m) => {
        consulta.recarregar();
        p.aoMudar(m);
      }}
      aoFechar={p.aoFechar}
    />
  ) : (
    <EmitirContrato
      {...p}
      titulo={titulo}
      descricao={descricao}
      cliente={cliente}
      modelo={consulta.dados.modelo}
      logo={org.logo_url}
      historico={historico}
      aoEmitir={(m) => {
        consulta.recarregar();
        p.aoMudar(m);
      }}
    />
  );
}

/** 529.982.247-25 enquanto digita. */
const mascaraCpf = (v: string) =>
  v
    .replace(/\D/g, "")
    .slice(0, 11)
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d{1,2})$/, "$1-$2");

type ClienteDoc = { razao_social: string; cnpj: string | null; cidade: string | null; uf: string | null };

function EmitirContrato({
  contrato,
  produtos,
  planos,
  diasBloqueio,
  hoje,
  cliente,
  modelo,
  logo,
  aoFechar,
  aoEmitir,
  titulo,
  descricao,
  historico,
}: Props & {
  cliente: ClienteDoc;
  modelo: { texto: string; versao: number };
  logo: string | null;
  aoEmitir: (m: string) => void;
  titulo: string;
  descricao: string;
  historico: React.ReactNode;
}) {
  const [sig, setSig] = useState<Signatario>({ nome: "", cpf: "", cargo: "", email: "" });
  const [modo, setModo] = useState<ModoAssinatura>("eletronico");
  const [erro, setErro] = useState("");
  const [ocupado, setOcupado] = useState<"" | "previa" | "emitir">("");
  const plano = contrato.plano_id ? planos.get(contrato.plano_id) : null;
  const texto = (numero: string) =>
    preencher(modelo.texto, valoresDoContrato({ numero, contrato, cliente, produtos, plano, signatario: sig, modo, diasBloqueio, hoje }));
  const campo = (k: keyof Signatario) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setSig((s) => ({ ...s, [k]: k === "cpf" ? mascaraCpf(e.target.value) : e.target.value }));

  async function previa() {
    setErro("");
    setOcupado("previa");
    try {
      await baixarContratoLicenca({
        texto: texto("{{numero}}").replaceAll("{{numero}}", "(a numerar)"),
        numero: "minuta",
        cliente,
        signatario: sig,
        logo,
        minuta: true,
      });
    } catch (e) {
      setErro(traduzirErro(e));
    }
    setOcupado("");
  }

  async function emitir() {
    const problema = conferirSignatario(sig, modo);
    if (problema) return setErro(problema);
    setErro("");
    setOcupado("emitir");
    try {
      // o número é dado pelo banco: o texto vai com {{numero}} e o banco troca na hora de emitir
      const r = await emitirDocumento(contrato.id, texto("{{numero}}"), modelo.versao, sig, modo);
      aoEmitir(
        modo === "eletronico"
          ? `Contrato ${r.numero} emitido. Agora gere o link e envie ao cliente para assinar.`
          : `Contrato ${r.numero} emitido. Baixe o PDF, colha a assinatura e registre aqui quando voltar assinado.`,
      );
    } catch (e) {
      setErro(traduzirErro(e));
      setOcupado("");
    }
  }

  return (
    <Modal
      titulo={titulo}
      descricao={descricao}
      largura="5xl"
      aoFechar={aoFechar}
      avisoRodape={erro ? <p className="rounded-md bg-red-50 p-2 text-sm text-red-800">{erro}</p> : null}
      rodape={
        <>
          <button className="btn" onClick={aoFechar}>
            <Icone nome="voltar" className="h-4 w-4" />
            Voltar
          </button>
          <button className="btn-primario" onClick={emitir} disabled={!!ocupado}>
            <Icone nome="check" className="h-4 w-4" />
            {ocupado === "emitir" ? "Emitindo…" : "Emitir contrato"}
          </button>
        </>
      }
    >
      <ColunasFormulario>
        <ColunaFormulario>
          <h3 className="font-semibold text-[var(--marca)]">Quem assina pelo cliente</h3>
          <label className="campo">
            <span>Nome completo</span>
            <input required value={sig.nome} onChange={campo("nome")} placeholder="Ex.: Maria da Silva" autoComplete="off" />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="campo">
              <span>CPF</span>
              <input required inputMode="numeric" value={sig.cpf} onChange={campo("cpf")} placeholder="000.000.000-00" />
            </label>
            <label className="campo">
              <span>Cargo (opcional)</span>
              <input value={sig.cargo} onChange={campo("cargo")} placeholder="Ex.: sócia-administradora" />
            </label>
          </div>
          <label className="campo">
            <span>E-mail (opcional)</span>
            <input type="email" value={sig.email} onChange={campo("email")} placeholder="nome@empresa.com.br" />
          </label>
          <p className="text-xs text-neutral-600">
            O contrato sai com o modelo {modelo.versao ? `versão ${modelo.versao}` : "padrão do HUB"} (Licenças › Modelo do contrato), os
            módulos, o valor e o reajuste desta licença.
          </p>
        </ColunaFormulario>
        <ColunaFormulario>
          <h3 className="font-semibold text-[var(--marca)]">Como o cliente vai assinar</h3>
          <div className="grid gap-2">
            {(
              [
                {
                  id: "eletronico",
                  icone: "enviar",
                  titulo: "Pelo link",
                  texto: "O cliente abre no celular, lê, confirma com o CPF e assina. O HUB guarda data, hora e IP.",
                },
                {
                  id: "impresso",
                  icone: "imprimir",
                  titulo: "Em papel (ou outro meio)",
                  texto: "Você baixa o PDF, colhe a assinatura e depois registra aqui a data em que voltou assinado.",
                },
              ] as const
            ).map((o) => (
              <button
                key={o.id}
                type="button"
                onClick={() => setModo(o.id)}
                aria-pressed={modo === o.id}
                className={`flex items-start gap-3 rounded-lg border p-3 text-left ${modo === o.id ? "border-[var(--marca)] bg-[var(--fundo)]" : "border-[var(--borda)]"}`}
              >
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[var(--fundo)] text-[var(--marca)]">
                  <Icone nome={o.icone} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">{o.titulo}</span>
                  <span className="block text-sm text-neutral-600">{o.texto}</span>
                </span>
                {modo === o.id && <Icone nome="check" className="h-5 w-5 text-[var(--marca)]" />}
              </button>
            ))}
          </div>
          <button type="button" className="btn w-full sm:w-auto" onClick={previa} disabled={!!ocupado}>
            <Icone nome="olho" className="h-4 w-4" />
            {ocupado === "previa" ? "Montando…" : "Ver minuta (PDF)"}
          </button>
        </ColunaFormulario>
      </ColunasFormulario>
      {historico}
    </Modal>
  );
}

function ContratoEmitido({
  doc,
  cliente,
  hoje,
  logo,
  aoMudar,
  aoFechar,
  titulo,
  descricao,
  historico,
  org,
  clienteId,
}: {
  org: string;
  clienteId: string;
  doc: DocumentoLicenca;
  cliente: ClienteDoc;
  hoje: string;
  logo: string | null;
  aoMudar: (m: string) => void;
  aoFechar: () => void;
  titulo: string;
  descricao: string;
  historico: React.ReactNode;
}) {
  const [link, setLink] = useState("");
  const [copiado, setCopiado] = useState(false);
  const [erro, setErro] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [papel, setPapel] = useState(false);
  const [cancelar, setCancelar] = useState(false);
  const [anexar, setAnexar] = useState(false);
  const rotulo = ROTULO_SITUACAO[doc.situacao];
  const esperando = doc.situacao === "emitido" || doc.situacao === "enviado";

  async function acao(f: () => Promise<void>) {
    setErro("");
    setOcupado(true);
    try {
      await f();
    } catch (e) {
      setErro(traduzirErro(e));
    }
    setOcupado(false);
  }

  const pdf = () =>
    acao(() => baixarContratoLicenca({ texto: doc.texto, numero: doc.numero, cliente, signatario: doc.signatario, logo, documento: doc }));

  const novoLink = () =>
    acao(async () => {
      const token = await gerarLink(doc.id);
      setLink(enderecoAssinatura(origemPublica(), token));
      aoMudar("Link de assinatura gerado. Ele vale 15 dias; um link novo invalida o anterior.");
    });

  async function copiar() {
    try {
      await navigator.clipboard.writeText(link);
      setCopiado(true);
    } catch {
      setErro("Não consegui copiar. Selecione o link e copie à mão.");
    }
  }

  const zap = link
    ? `https://wa.me/?text=${encodeURIComponent(mensagemAssinatura(doc.signatario.nome, doc.numero, link, saudacao(new Date().getHours())))}`
    : "";

  return (
    <Modal
      titulo={titulo}
      descricao={descricao}
      largura="2xl"
      aoFechar={aoFechar}
      avisoRodape={erro ? <p className="rounded-md bg-red-50 p-2 text-sm text-red-800">{erro}</p> : null}
      rodape={
        <>
          <button className="btn" onClick={aoFechar}>
            <Icone nome="voltar" className="h-4 w-4" />
            Voltar
          </button>
          <button className="btn text-[var(--perigo)]" onClick={() => setCancelar(true)} disabled={ocupado}>
            <Icone nome="cancelar" className="h-4 w-4" />
            Cancelar contrato
          </button>
          {esperando && doc.modo === "impresso" && (
            <button className="btn" onClick={() => setPapel(true)} disabled={ocupado}>
              <Icone nome="editar" className="h-4 w-4" />
              Registrar assinatura
            </button>
          )}
          {esperando && doc.modo === "eletronico" && (
            <button className="btn" onClick={novoLink} disabled={ocupado}>
              <Icone nome="enviar" className="h-4 w-4" />
              {doc.situacao === "enviado" ? "Gerar link novo" : "Gerar link de assinatura"}
            </button>
          )}
          {doc.arquivo_id && (
            <button className="btn" onClick={() => acao(() => abrirContratoAssinado(doc.arquivo_id!))} disabled={ocupado}>
              <Icone nome="clipe" className="h-4 w-4" />
              Ver contrato assinado
            </button>
          )}
          {doc.situacao === "assinado" && doc.modo === "impresso" && (
            <button className="btn" onClick={() => setAnexar(true)} disabled={ocupado}>
              <Icone nome="importar" className="h-4 w-4" />
              {doc.arquivo_id ? "Trocar arquivo assinado" : "Anexar contrato assinado"}
            </button>
          )}
          <button className="btn-primario" onClick={pdf} disabled={ocupado}>
            <Icone nome="baixar" className="h-4 w-4" />
            {doc.situacao === "assinado" ? "Baixar contrato assinado" : "Baixar PDF"}
          </button>
        </>
      }
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-lg font-semibold">{doc.numero}</span>
        <Chip tom={rotulo.tom}>{rotulo.texto}</Chip>
      </div>
      <dl className="grid gap-x-4 gap-y-1 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-neutral-500">Emitido em</dt>
          <dd>{fmtDataHora(doc.emitido_em)}</dd>
        </div>
        <div>
          <dt className="text-neutral-500">Assina pelo cliente</dt>
          <dd>{doc.signatario.nome}</dd>
        </div>
        <div>
          <dt className="text-neutral-500">Forma de assinatura</dt>
          <dd>{doc.modo === "eletronico" ? "Pelo link (eletrônica)" : "Em papel ou outro meio"}</dd>
        </div>
        {doc.situacao === "enviado" && doc.link_expira_em && (
          <div>
            <dt className="text-neutral-500">Link vale até</dt>
            <dd>{fmtData(doc.link_expira_em)}</dd>
          </div>
        )}
        {doc.assinatura && (
          <div className="sm:col-span-2">
            <dt className="text-neutral-500">Assinatura</dt>
            <dd>
              {doc.assinatura.tipo === "eletronico"
                ? `${doc.assinatura.nome} assinou pelo link em ${fmtDataHora(doc.assinatura.em)}${doc.assinatura.ip ? ` (IP ${doc.assinatura.ip})` : ""}.`
                : `Assinado em ${fmtData(doc.assinatura.data)}${doc.assinatura.observacao ? ` · ${doc.assinatura.observacao}` : ""}.`}
            </dd>
          </div>
        )}
      </dl>

      {link && (
        <div className="space-y-2 rounded-md bg-[var(--fundo)] p-3">
          <p className="text-sm font-medium">Link de assinatura (aparece só agora; guarde ou envie já):</p>
          <input readOnly value={link} className="w-full text-sm" onFocus={(e) => e.target.select()} aria-label="Link de assinatura" />
          <div className="flex flex-wrap gap-2">
            <button className="btn" onClick={copiar}>
              <Icone nome={copiado ? "check" : "copiar"} className="h-4 w-4" />
              {copiado ? "Copiado" : "Copiar link"}
            </button>
            <a className="btn" href={zap} target="_blank" rel="noopener noreferrer">
              <Icone nome="chat" className="h-4 w-4" />
              Enviar pelo WhatsApp
            </a>
            <a
              className="btn"
              href={emailAssinatura({
                para: doc.signatario.email,
                nome: doc.signatario.nome,
                numero: doc.numero,
                cliente: cliente.razao_social,
                link,
                validoAte: doc.link_expira_em ? fmtData(doc.link_expira_em) : "daqui a 15 dias",
                saudacao: saudacao(new Date().getHours()),
              })}
            >
              <Icone nome="enviar" className="h-4 w-4" />
              Enviar por e-mail
            </a>
          </div>
        </div>
      )}

      {historico}

      {(papel || anexar) && (
        <RegistrarPapel
          doc={doc}
          hoje={hoje}
          org={org}
          clienteId={clienteId}
          soArquivo={anexar}
          aoFechar={() => (setPapel(false), setAnexar(false))}
          aoSalvar={(m) => (setPapel(false), setAnexar(false), aoMudar(m))}
        />
      )}
      {cancelar && (
        <JanelaMotivo
          titulo={`Cancelar o contrato ${doc.numero}`}
          descricao="O contrato fica guardado como cancelado (com o motivo) e o link deixa de funcionar. Depois você pode emitir um novo para esta licença."
          botao="Cancelar contrato"
          aoFechar={() => setCancelar(false)}
          aoConfirmar={async (motivo) => {
            if (motivo.length < 5) throw new Error("Explique o motivo (mínimo 5 letras)");
            await cancelarDocumento(doc.id, motivo);
            setCancelar(false);
            aoMudar(`Contrato ${doc.numero} cancelado.`);
          }}
        />
      )}
    </Modal>
  );
}

function RegistrarPapel({
  doc,
  hoje,
  org,
  clienteId,
  soArquivo,
  aoFechar,
  aoSalvar,
}: {
  doc: DocumentoLicenca;
  hoje: string;
  org: string;
  clienteId: string;
  /** true = contrato já assinado: só anexa (ou troca) o arquivo. */
  soArquivo: boolean;
  aoFechar: () => void;
  aoSalvar: (m: string) => void;
}) {
  const [data, setData] = useState(hoje);
  const [obs, setObs] = useState("");
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [erro, setErro] = useState("");
  const [ocupado, setOcupado] = useState(false);
  async function salvar() {
    if (!soArquivo && !data) return setErro("Informe a data em que o cliente assinou.");
    if (soArquivo && !arquivo) return setErro("Escolha o arquivo do contrato assinado (PDF ou foto).");
    setErro("");
    setOcupado(true);
    try {
      const id = arquivo ? await enviarContratoAssinado(org, doc.id, clienteId, arquivo) : null;
      if (soArquivo) {
        await anexarAssinado(doc.id, id!);
        aoSalvar(`Contrato assinado ${doc.numero} anexado.`);
      } else {
        await registrarAssinatura(doc.id, data, obs.trim() || null, id);
        aoSalvar(`Assinatura do contrato ${doc.numero} registrada${id ? " com o arquivo assinado" : ""}.`);
      }
    } catch (e) {
      setErro(traduzirErro(e));
      setOcupado(false);
    }
  }
  return (
    <Modal
      titulo={soArquivo ? "Anexar contrato assinado" : "Registrar assinatura"}
      descricao={
        soArquivo
          ? `Contrato ${doc.numero}: guarde aqui o PDF ou a foto do contrato assinado.`
          : `Contrato ${doc.numero}: informe quando o cliente devolveu assinado e, se tiver, anexe o arquivo.`
      }
      aoFechar={aoFechar}
      avisoRodape={erro ? <p className="rounded-md bg-red-50 p-2 text-sm text-red-800">{erro}</p> : null}
      rodape={
        <>
          <button className="btn" onClick={aoFechar}>
            <Icone nome="voltar" className="h-4 w-4" />
            Voltar
          </button>
          <button className="btn-primario" onClick={salvar} disabled={ocupado}>
            <Icone nome="check" className="h-4 w-4" />
            {ocupado ? "Salvando…" : soArquivo ? "Anexar" : "Registrar assinatura"}
          </button>
        </>
      }
    >
      {!soArquivo && (
        <>
          <label className="campo">
            <span>Data da assinatura</span>
            <input required type="date" value={data} max={hoje} onChange={(e) => setData(e.target.value)} />
          </label>
          <label className="campo">
            <span>Observação (opcional)</span>
            <input value={obs} onChange={(e) => setObs(e.target.value)} placeholder="Ex.: via física no arquivo do cliente" />
          </label>
        </>
      )}
      <CampoArquivo
        aoEscolher={(a) => setArquivo(a[0] ?? null)}
        accept=".pdf,.jpg,.jpeg,.png,.webp,.heic"
        titulo={
          soArquivo ? "Arraste o contrato assinado aqui ou clique para escolher" : "Contrato assinado (opcional): arraste aqui ou clique"
        }
        dica="PDF ou foto, até 15 MB. Só quem vê os valores das licenças consegue abrir."
        escolhido={arquivo?.name ?? null}
        compacto
      />
    </Modal>
  );
}
