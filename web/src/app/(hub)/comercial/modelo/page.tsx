"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useOrg } from "@/lib/org";
import { supabase } from "@/lib/supabase";
import { traduzirErro } from "@/lib/erros";
import { VARIAVEIS, montarContrato, valoresIniciais } from "@/lib/crm";
import type { Modelo, Oportunidade } from "@/lib/crm";
import { mdParaHtml } from "@/lib/balancete";
import { baixarBytes, gerarContratoPdf } from "@/lib/contratoPdf";
import { carregarLogo } from "@/lib/marca";

export default function PaginaModelo() {
  return <EditorModelo />;
}

const EXEMPLO = {
  id: "",
  org_id: "",
  empresa: "EMPRESA EXEMPLO LTDA",
  razao_social: "EMPRESA EXEMPLO LTDA",
  cnpj: "00.000.000/0001-00",
  contato_nome: "Fulano de Tal",
  cidade: "Bragança Paulista",
  uf: "SP",
  valor_mensal: 1500,
} as unknown as Oportunidade;

function EditorModelo() {
  const { org, eu, pode, recarregar } = useOrg();
  const [modelo, setModelo] = useState<Modelo | null>(null);
  const [nome, setNome] = useState("");
  const [texto, setTexto] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [logoPrev, setLogoPrev] = useState<string | null>(null);
  const area = useRef<HTMLTextAreaElement>(null);
  const podeGerir = pode("comercial", "gerir");

  const carregar = useCallback(async () => {
    const { data } = await supabase()
      .from("crm_modelos")
      .select("*")
      .eq("org_id", org.id)
      .eq("ativo", true)
      .order("atualizado_em", { ascending: false })
      .limit(1);
    const m = ((data as Modelo[]) ?? [])[0] ?? null;
    setModelo(m);
    setNome(m?.nome ?? "Prestação de serviços contábeis");
    setTexto(m?.texto ?? "");
  }, [org.id]);
  useEffect(() => {
    void carregar();
  }, [carregar]);
  useEffect(() => {
    let url: string | null = null;
    void carregarLogo(org.logo_url).then((b) => {
      if (b) {
        url = URL.createObjectURL(new Blob([b as BlobPart]));
        setLogoPrev(url);
      } else setLogoPrev(null);
    });
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [org.logo_url]);

  function inserir(chave: string) {
    const el = area.current;
    const ins = `{{${chave}}}`;
    if (!el) return setTexto(texto + ins);
    const a = el.selectionStart,
      b = el.selectionEnd;
    setTexto(texto.slice(0, a) + ins + texto.slice(b));
    requestAnimationFrame(() => {
      el.focus();
      el.selectionStart = el.selectionEnd = a + ins.length;
    });
  }

  async function salvar() {
    setErro(null);
    const sb = supabase();
    const r = modelo
      ? await sb
          .from("crm_modelos")
          .update({ nome, texto, versao: modelo.versao + 1, atualizado_por: eu.user_id, atualizado_em: new Date().toISOString() })
          .eq("id", modelo.id)
      : await sb.from("crm_modelos").insert({ org_id: org.id, nome, texto, atualizado_por: eu.user_id });
    if (r.error) return setErro(traduzirErro(r.error));
    setAviso("Modelo salvo. Contratos novos usam esta versão; os já gerados ficam como estavam.");
    void carregar();
  }

  async function enviarLogo(arq: File) {
    setErro(null);
    if (!/image\/(png|jpe?g)/.test(arq.type)) return setErro("Use a logo em PNG (de preferência branca com fundo transparente) ou JPG.");
    const caminho = `${org.id}/marca/logo-${Date.now()}.${arq.type.includes("png") ? "png" : "jpg"}`;
    const up = await supabase().storage.from("hub-arquivos").upload(caminho, arq, { contentType: arq.type });
    if (up.error) return setErro(traduzirErro(up.error));
    const { error } = await supabase()
      .from("organizacoes")
      .update({ logo_url: `storage:${caminho}` })
      .eq("id", org.id);
    if (error) return setErro(traduzirErro(error));
    setAviso("Logo atualizada. Ela aparece no cabeçalho dos contratos.");
    void recarregar();
  }

  async function previa() {
    const v = valoresIniciais(EXEMPLO);
    v.endereco = "Rua Exemplo, 100, Centro, CEP 12900-000";
    v.honorario_mensal = 1500;
    const bytes = await gerarContratoPdf({
      texto: montarContrato(texto, v, "2026/000"),
      numero: "2026/000",
      contratante: { nome: v.razao_social, representante: v.representante },
      logo: await carregarLogo(org.logo_url),
      rascunho: true,
    });
    baixarBytes(bytes, "Previa-modelo-contrato.pdf");
  }

  if (!podeGerir) return <p className="text-sm text-neutral-600">Só quem gerencia o CRM edita o modelo de contrato.</p>;
  const exemploTexto = montarContrato(texto, { ...valoresIniciais(EXEMPLO), endereco: "Rua Exemplo, 100, Centro" }, "2026/000");

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-[var(--marca)]">Modelo de contrato</h1>
        <p className="text-sm text-neutral-600">
          Cole aqui o seu contrato-base. Onde entram os dados negociados, use as variáveis entre chaves, por exemplo{" "}
          {"{{honorario_mensal}}"}. No CRM a equipe preenche só os valores.
        </p>
      </div>
      {erro && <p className="rounded-md bg-red-50 p-3 text-sm text-red-800">{erro}</p>}
      {aviso && <p className="rounded-md bg-emerald-50 p-3 text-sm text-emerald-800">{aviso}</p>}

      <section className="cartao flex flex-wrap items-center gap-4 p-4">
        <div className="flex h-16 w-48 items-center justify-center rounded-md bg-[var(--marca)] p-2">
          {logoPrev ? (
            <img src={logoPrev} alt="Logo atual" className="max-h-12 max-w-full" />
          ) : (
            <span className="text-xl font-bold text-[var(--destaque)]">MDC</span>
          )}
        </div>
        <div className="mr-auto text-sm">
          <div className="font-medium">Layout MDC do contrato</div>
          <div className="text-xs text-neutral-600">
            Cabeçalho verde com a sua logo, títulos em verde e dourado, rodapé com CNPJ e contatos, numeração de páginas, campo de rubricas
            e assinaturas com duas testemunhas.
            {!logoPrev && " A logo do site não pôde ser carregada aqui: envie o arquivo (PNG branco com fundo transparente)."}
          </div>
        </div>
        <label className="btn cursor-pointer">
          Enviar logo
          <input
            type="file"
            accept="image/png,image/jpeg"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && enviarLogo(e.target.files[0])}
          />
        </label>
        <button className="btn" onClick={previa}>
          Baixar PDF de exemplo
        </button>
      </section>

      <div className="grid gap-5 xl:grid-cols-2">
        <section className="space-y-2">
          <label className="campo">
            <span>Nome do modelo</span>
            <input value={nome} onChange={(e) => setNome(e.target.value)} />
          </label>
          <div className="flex flex-wrap gap-1">
            {VARIAVEIS.map((x) => (
              <button
                key={x.chave}
                type="button"
                className="chip bg-[var(--fundo)] text-neutral-700 hover:bg-amber-50"
                title={x.descricao}
                onClick={() => inserir(x.chave)}
              >
                {x.chave}
              </button>
            ))}
          </div>
          <textarea
            ref={area}
            className="entrada h-[620px] w-full font-mono text-[13px]"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
          />
          <p className="text-xs text-neutral-500">
            # título · ## cláusula · - item de lista · **negrito**. Cláusulas opcionais ({"{{clausula_13}}"}, {"{{clausula_implantacao}}"},{" "}
            {"{{clausula_funcionarios}}"}) somem quando não se aplicam.
          </p>
          <div className="flex gap-2">
            <button className="btn-primario" onClick={salvar}>
              Salvar modelo {modelo ? `(versão ${modelo.versao + 1})` : ""}
            </button>
          </div>
        </section>
        <section>
          <h2 className="mb-2 text-sm font-semibold">Prévia com dados de exemplo</h2>
          <article
            className="prosa max-h-[760px] overflow-y-auto rounded-lg border border-[var(--borda)] bg-white p-5"
            dangerouslySetInnerHTML={{ __html: mdParaHtml(exemploTexto) }}
          />
        </section>
      </div>
    </div>
  );
}
