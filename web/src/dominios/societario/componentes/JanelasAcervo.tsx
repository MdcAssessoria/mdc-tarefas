// Janelas do acervo de documentos societários (073): "Guardar no acervo" (arquivo novo do cliente ou anexo de um
// processo, com tipo, data, registro na Junta e qual documento vigente ele substitui) e "Editar ficha". Gravação só
// pelas funções do banco soc_documento_guardar / soc_documento_editar.
"use client";

import { useCallback, useState } from "react";
import { useOrg } from "@/dominios/organizacao/OrgProvider";
import { nomeCliente } from "@/dominios/clientes/nome";
import { supabase } from "@/lib/supabase";
import { exigir } from "@/lib/exigir";
import { traduzirErro } from "@/lib/erros";
import { useConsulta } from "@/lib/useConsulta";
import { fmtData } from "@/lib/formato/datas";
import { enviarArquivo } from "@/lib/arquivos/armazenamento";
import type { Arquivo } from "@/lib/arquivos/armazenamento";
import { Modal } from "@/components/ui/Modal";
import { CampoArquivo } from "@/components/ui/CampoArquivo";
import { Icone } from "@/components/ui/Icone";
import { CATEGORIAS, nomeCategoria, sugerirSubstituido } from "../acervo";
import type { DocumentoAcervo } from "../acervo";
import { lerAcervo } from "../leituras";

const SEM_ACERVO: DocumentoAcervo[] = [];

/** Campos da ficha (tipo, descrição, data e registro), iguais em guardar e editar. */
function CamposFicha({
  categoria,
  descricao,
  data,
  registro,
  aoMudar,
}: {
  categoria: string;
  descricao: string;
  data: string;
  registro: string;
  aoMudar: (campo: "categoria" | "descricao" | "data" | "registro", valor: string) => void;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="campo">
        <span>Tipo do documento</span>
        <select required value={categoria} onChange={(e) => aoMudar("categoria", e.target.value)}>
          <option value="">Escolha…</option>
          {CATEGORIAS.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nome}
            </option>
          ))}
        </select>
      </label>
      <label className="campo">
        <span>Data do documento</span>
        <input type="date" value={data} onChange={(e) => aoMudar("data", e.target.value)} />
      </label>
      <label className="campo">
        <span>Descrição</span>
        <input
          maxLength={300}
          value={descricao}
          onChange={(e) => aoMudar("descricao", e.target.value)}
          placeholder="Ex.: 3ª alteração – entrada de sócio"
        />
      </label>
      <label className="campo">
        <span>Registro na Junta</span>
        <input
          maxLength={80}
          value={registro}
          onChange={(e) => aoMudar("registro", e.target.value)}
          placeholder="NIRE ou nº de arquivamento"
        />
      </label>
    </div>
  );
}

/**
 * Guarda um documento no acervo do cliente. Dois jeitos:
 * - `anexo` + `processoId`: um anexo do processo vai para o acervo (o cliente é o do processo);
 * - sem `anexo`: envia um arquivo novo; o cliente vem de `clienteId` ou é escolhido na janela.
 */
export function JanelaGuardarAcervo({
  clienteId,
  anexo,
  processoId,
  aoFechar,
  aoSalvo,
}: {
  clienteId?: string | null;
  anexo?: Arquivo | null;
  processoId?: string | null;
  aoFechar: () => void;
  aoSalvo: (mensagem: string) => void;
}) {
  const { org, clientes, clientePorId } = useOrg();
  const [cliente, setCliente] = useState(clienteId ?? "");
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [ficha, setFicha] = useState({ categoria: "", descricao: "", data: "", registro: "" });
  const [substitui, setSubstitui] = useState<string | null>(null); // null = ainda segue a sugestão
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const acervo = useConsulta(useCallback(() => (cliente ? lerAcervo(org.id, cliente) : Promise.resolve(SEM_ACERVO)), [org.id, cliente]));
  const vigentes = (acervo.dados ?? SEM_ACERVO).filter((d) => d.vigente);
  const substituiEfetivo = substitui ?? sugerirSubstituido(vigentes, ficha.categoria);

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    if (!cliente) return setErro("Escolha o cliente do documento.");
    if (!anexo && !arquivo) return setErro("Escolha o arquivo.");
    if (!ficha.categoria) return setErro("Escolha o tipo do documento.");
    setErro(null);
    setSalvando(true);
    try {
      const alvo = anexo ?? (await enviarArquivo(arquivo!, { org: org.id, app: "societario", cliente }));
      exigir(
        await supabase().rpc("soc_documento_guardar", {
          p_arquivo: alvo.id,
          p_categoria: ficha.categoria,
          p_descricao: ficha.descricao || null,
          p_data: ficha.data || null,
          p_registro: ficha.registro || null,
          p_processo: processoId ?? null,
          p_substitui: substituiEfetivo || null,
        }),
      );
      aoSalvo(
        substituiEfetivo
          ? `${nomeCategoria(ficha.categoria)} guardado no acervo; o documento anterior ficou como substituído.`
          : `${nomeCategoria(ficha.categoria)} guardado no acervo do cliente.`,
      );
    } catch (x) {
      setErro(traduzirErro(x));
      setSalvando(false);
    }
  }

  const nomeDoCliente = nomeCliente(clientePorId(cliente || null), "");
  return (
    <Modal
      titulo="Guardar no acervo do cliente"
      descricao="O documento fica guardado no cadastro do cliente e serve de base para as próximas alterações."
      aoFechar={() => !salvando && aoFechar()}
      largura="4xl"
      avisoRodape={
        erro && (
          <p role="alert" className="text-sm text-red-700">
            {erro}
          </p>
        )
      }
      rodape={
        <>
          <button type="submit" form="form-acervo" className="btn-primario" disabled={salvando}>
            <Icone nome="pasta" className="h-4 w-4" />
            {salvando ? "Guardando…" : "Guardar no acervo"}
          </button>
          <button type="button" className="btn" onClick={aoFechar} disabled={salvando}>
            <Icone nome="voltar" className="h-4 w-4" />
            Voltar
          </button>
        </>
      }
    >
      <form id="form-acervo" onSubmit={(e) => void salvar(e)} className="space-y-4">
        <div className="grid gap-3 lg:grid-cols-2">
          {clienteId || anexo ? (
            <div className="rounded-lg bg-[var(--fundo)] px-3 py-2 text-sm">
              <span className="block text-xs text-[var(--texto-suave)]">Cliente</span>
              <b>{nomeDoCliente || "—"}</b>
            </div>
          ) : (
            <label className="campo">
              <span>Cliente</span>
              <select
                required
                value={cliente}
                onChange={(e) => {
                  setCliente(e.target.value);
                  setSubstitui(null);
                }}
              >
                <option value="">Escolha o cliente…</option>
                {clientes
                  .filter((c) => c.ativo)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.codigo_dominio ? `${c.codigo_dominio} · ` : ""}
                      {nomeCliente(c)}
                    </option>
                  ))}
              </select>
            </label>
          )}
          {anexo ? (
            <div className="rounded-lg bg-[var(--fundo)] px-3 py-2 text-sm">
              <span className="block text-xs text-[var(--texto-suave)]">Arquivo do processo</span>
              <b className="break-all">{anexo.nome}</b>
            </div>
          ) : (
            <CampoArquivo
              compacto
              aoEscolher={(a) => setArquivo(a[0] ?? null)}
              escolhido={arquivo?.name}
              titulo="Arraste o documento aqui ou clique para escolher"
              dica="PDF ou imagem do documento (até 50 MB)"
              accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
            />
          )}
        </div>

        <CamposFicha
          {...ficha}
          aoMudar={(campo, valor) => {
            setFicha((f) => ({ ...f, [campo]: valor }));
            if (campo === "categoria") setSubstitui(null);
          }}
        />

        {cliente && vigentes.length > 0 && (
          <label className="campo">
            <span>Substitui algum documento vigente?</span>
            <select value={substituiEfetivo} onChange={(e) => setSubstitui(e.target.value)}>
              <option value="">Não, é um documento a mais</option>
              {vigentes.map((d) => (
                <option key={d.id} value={d.id}>
                  {nomeCategoria(d.categoria)}
                  {d.descricao ? ` – ${d.descricao}` : ""}
                  {d.data_documento ? ` (${fmtData(d.data_documento)})` : ""}
                </option>
              ))}
            </select>
            <small className="mt-1 block text-xs text-[var(--texto-suave)]">
              O substituído continua guardado, marcado como &quot;Substituído&quot;. O novo passa a ser a base das próximas alterações.
            </small>
          </label>
        )}
      </form>
    </Modal>
  );
}

/** Corrige a ficha de um documento do acervo (o arquivo não muda). */
export function JanelaEditarAcervo({
  doc,
  aoFechar,
  aoSalvo,
}: {
  doc: DocumentoAcervo;
  aoFechar: () => void;
  aoSalvo: (mensagem: string) => void;
}) {
  const [ficha, setFicha] = useState({
    categoria: doc.categoria as string,
    descricao: doc.descricao ?? "",
    data: doc.data_documento ?? "",
    registro: doc.registro ?? "",
  });
  const [vigente, setVigente] = useState(doc.vigente);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    setSalvando(true);
    try {
      exigir(
        await supabase().rpc("soc_documento_editar", {
          p_doc: doc.id,
          p_categoria: ficha.categoria,
          p_descricao: ficha.descricao || null,
          p_data: ficha.data || null,
          p_registro: ficha.registro || null,
          p_vigente: vigente,
        }),
      );
      aoSalvo("Ficha do documento atualizada.");
    } catch (x) {
      setErro(traduzirErro(x));
      setSalvando(false);
    }
  }

  return (
    <Modal
      titulo="Editar ficha do documento"
      descricao={doc.arquivo?.nome}
      aoFechar={() => !salvando && aoFechar()}
      largura="2xl"
      avisoRodape={
        erro && (
          <p role="alert" className="text-sm text-red-700">
            {erro}
          </p>
        )
      }
      rodape={
        <>
          <button type="submit" form="form-ficha-acervo" className="btn-primario" disabled={salvando}>
            <Icone nome="check" className="h-4 w-4" />
            {salvando ? "Salvando…" : "Salvar"}
          </button>
          <button type="button" className="btn" onClick={aoFechar} disabled={salvando}>
            <Icone nome="voltar" className="h-4 w-4" />
            Voltar
          </button>
        </>
      }
    >
      <form id="form-ficha-acervo" onSubmit={(e) => void salvar(e)} className="space-y-4">
        <CamposFicha {...ficha} aoMudar={(campo, valor) => setFicha((f) => ({ ...f, [campo]: valor }))} />
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={vigente} onChange={(e) => setVigente(e.target.checked)} />
          Documento vigente (vale hoje e serve de base para alterações)
        </label>
      </form>
    </Modal>
  );
}
