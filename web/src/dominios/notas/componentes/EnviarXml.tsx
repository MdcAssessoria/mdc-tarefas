// Envio de XML avulso (NF-e ou NFS-e nacional): para municípios fora do padrão nacional, notas com mais de 90 dias que a
// SEFAZ não distribui mais, ou quando a empresa ainda não tem certificado. Mostra o que foi lido antes de gravar.
"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { CampoArquivo } from "@/components/ui/CampoArquivo";
import { brl } from "@/lib/formato/moeda";
import { traduzirErro } from "@/lib/erros";
import { useOrg } from "@/dominios/organizacao/OrgProvider";
import { enviarXml, lerXmlDoArquivo } from "../repositorio";
import type { NotaLida } from "../documentos";
import { nomeModelo } from "./Comuns";

export function EnviarXml({
  org,
  cliente,
  aoFechar,
  aoConcluir,
}: {
  org: string;
  cliente: string;
  aoFechar: () => void;
  aoConcluir: (msg: string) => void;
}) {
  const { org: organizacao } = useOrg(); // fuso da organização para a pasta do mês
  const [arquivos, setArquivos] = useState<{ arquivo: File; notas: NotaLida[]; erro?: string }[]>([]);
  const [ocupado, setOcupado] = useState(false);
  const [erros, setErros] = useState<string[]>([]);

  async function escolher(lista: File[]) {
    setErros([]);
    setArquivos(
      await Promise.all(
        lista.map(async (arquivo) => {
          try {
            return { arquivo, notas: await lerXmlDoArquivo(arquivo) };
          } catch (e) {
            return { arquivo, notas: [], erro: traduzirErro(e) };
          }
        }),
      ),
    );
  }

  async function enviar() {
    setOcupado(true);
    const falhas: string[] = [];
    let total = 0;
    for (const a of arquivos.filter((x) => !x.erro)) {
      try {
        const r = await enviarXml(org, cliente, a.arquivo, organizacao.fuso);
        total += r.enviadas;
        falhas.push(...r.erros.map((e) => `${a.arquivo.name}: ${e}`));
      } catch (e) {
        falhas.push(`${a.arquivo.name}: ${traduzirErro(e)}`);
      }
    }
    setOcupado(false);
    if (falhas.length) setErros(falhas);
    else aoConcluir(`${total} nota(s) enviada(s).`);
  }

  const validas = arquivos.filter((a) => !a.erro).reduce((n, a) => n + a.notas.length, 0);
  return (
    <Modal
      titulo="Enviar XML de nota"
      descricao="Use quando a nota não chegou pela busca automática (prefeitura fora do padrão nacional, nota antiga, sem certificado)."
      aoFechar={aoFechar}
      largura="lg"
    >
      <CampoArquivo
        multiplo
        accept=".xml,text/xml,application/xml"
        titulo="Arraste os XML aqui ou clique para escolher"
        aoEscolher={escolher}
        ocupado={ocupado}
      />
      {!!arquivos.length && (
        <ul className="max-h-60 space-y-1 overflow-y-auto text-sm">
          {arquivos.map((a) => (
            <li key={a.arquivo.name} className={`rounded-md p-2 ${a.erro ? "bg-red-50 text-red-800" : "bg-neutral-50"}`}>
              <span className="font-medium">{a.arquivo.name}</span>
              {a.erro
                ? ` — ${a.erro}`
                : a.notas.map((n) => (
                    <span key={n.chave} className="block text-xs text-neutral-600">
                      {nomeModelo(n.modelo)} {n.numero} · {n.emitente_nome} · {brl(n.valor_total)} · {n.itens.length} item(ns)
                    </span>
                  ))}
            </li>
          ))}
        </ul>
      )}
      {!!erros.length && (
        <div className="rounded-md bg-red-50 p-2 text-sm text-red-800">
          {erros.map((e) => (
            <p key={e}>{e}</p>
          ))}
        </div>
      )}
      <div className="flex justify-end gap-2 pt-2">
        <button className="btn" onClick={aoFechar}>
          Voltar
        </button>
        <button className="btn-primario" onClick={enviar} disabled={!validas || ocupado}>
          {ocupado ? "Enviando…" : `Enviar ${validas} nota(s)`}
        </button>
      </div>
    </Modal>
  );
}
