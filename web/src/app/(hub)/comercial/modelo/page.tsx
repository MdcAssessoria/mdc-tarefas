// Comercial › Modelo de contrato: o texto-base com as variáveis ({{honorario_mensal}}…) que a ficha da oportunidade
// preenche, a logo do cabeçalho do PDF e a prévia com dados de exemplo. Quem abre: comercial "gerir" (Guarda).
"use client";

import { useCallback, useRef, useState } from "react";
import { useOrg } from "@/dominios/organizacao/OrgProvider";
import { useConsulta } from "@/lib/useConsulta";
import { traduzirErro } from "@/lib/erros";
import { useLogo } from "@/lib/marca";
import { mdParaHtml } from "@/lib/markdown";
import { useAviso } from "@/components/ui/Aviso";
import { CabecalhoPagina } from "@/components/ui/CabecalhoPagina";
import { Esqueleto } from "@/components/ui/Esqueleto";
import { Icone } from "@/components/ui/Icone";
import { VARIAVEIS, montarContrato, valoresIniciais } from "@/dominios/comercial/crm";
import type { Modelo, Oportunidade, Valores } from "@/dominios/comercial/crm";
import { lerModeloAtivo } from "@/dominios/comercial/leituras";
import { enviarLogo, salvarModelo } from "@/dominios/comercial/repositorio";
import { baixarContratoPdf } from "@/dominios/comercial/baixarContrato";

export default function PaginaModelo() {
  const { org } = useOrg();
  const consulta = useConsulta(useCallback(() => lerModeloAtivo(org.id), [org.id]));
  if (consulta.erro && consulta.dados === undefined)
    return (
      <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-800">
        {consulta.erro}
      </p>
    );
  if (consulta.dados === undefined) return <Esqueleto indicadores={0} linhas={8} />;
  // a chave recria o editor com o texto salvo quando muda a versão
  const m = consulta.dados;
  return <EditorModelo key={m ? `${m.id}-${m.versao}` : "novo"} modelo={m} aoSalvar={consulta.recarregar} />;
}

const EXEMPLO = {
  empresa: "EMPRESA EXEMPLO LTDA",
  razao_social: "EMPRESA EXEMPLO LTDA",
  cnpj: "00.000.000/0001-00",
  contato_nome: "Fulano de Tal",
  cidade: "Bragança Paulista",
  uf: "SP",
  valor_mensal: 1500,
} as Oportunidade;
const valoresExemplo = (): Valores => ({ ...valoresIniciais(EXEMPLO), endereco: "Rua Exemplo, 100, Centro, CEP 12900-000" });

function EditorModelo({ modelo, aoSalvar }: { modelo: Modelo | null; aoSalvar: () => void }) {
  const { org, eu, recarregar } = useOrg();
  const { aviso, mostrar } = useAviso();
  const [nome, setNome] = useState(modelo?.nome ?? "Prestação de serviços contábeis");
  const [texto, setTexto] = useState(modelo?.texto ?? "");
  const [ocupado, setOcupado] = useState<"salvar" | "pdf" | "logo" | null>(null);
  const area = useRef<HTMLTextAreaElement>(null);
  const logo = useLogo(org.logo_url);
  const alterado = !modelo || nome !== modelo.nome || texto !== modelo.texto;

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

  async function fazer(qual: "salvar" | "pdf" | "logo", f: () => Promise<void>) {
    setOcupado(qual);
    try {
      await f();
    } catch (e) {
      mostrar(traduzirErro(e), "erro");
    } finally {
      setOcupado(null);
    }
  }

  const salvar = () =>
    fazer("salvar", async () => {
      if (!texto.trim()) throw new Error("Cole o texto do contrato antes de salvar.");
      await salvarModelo(org.id, eu.user_id, modelo, nome.trim() || "Prestação de serviços contábeis", texto);
      mostrar("Modelo salvo. Contratos novos usam esta versão; os já gerados ficam como estavam.");
      aoSalvar();
    });

  const previa = () =>
    fazer("pdf", () =>
      baixarContratoPdf(
        { texto: montarContrato(texto, valoresExemplo(), "2026/000"), numero: "2026/000", valores: valoresExemplo(), status: "rascunho" },
        org.logo_url,
      ),
    );

  const trocarLogo = (arq: File) =>
    fazer("logo", async () => {
      await enviarLogo(org.id, arq);
      mostrar("Logo atualizada. Ela aparece no cabeçalho dos contratos.");
      await recarregar();
    });

  const exemploTexto = montarContrato(texto, valoresExemplo(), "2026/000");

  return (
    <div className="space-y-4">
      <CabecalhoPagina
        titulo="Modelo de contrato"
        descricao="O texto-base dos contratos. Na ficha de cada oportunidade a equipe preenche só os valores negociados."
        acoes={
          <>
            <button className="btn" onClick={previa} disabled={!texto.trim() || ocupado === "pdf"}>
              <Icone nome="documento" className="h-4 w-4" />
              {ocupado === "pdf" ? "Gerando…" : "PDF de exemplo"}
            </button>
            <button className="btn-primario" onClick={salvar} disabled={!alterado || ocupado === "salvar"}>
              <Icone nome="check" className="h-4 w-4" />
              {ocupado === "salvar" ? "Salvando…" : modelo ? `Salvar (versão ${modelo.versao + 1})` : "Salvar modelo"}
            </button>
          </>
        }
      />
      {aviso}

      {!modelo && (
        <p className="flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
          <Icone nome="info" className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            Ainda não há modelo. Cole abaixo o seu contrato de prestação de serviços e troque os dados de cada cliente pelas variáveis
            (clique numa variável para inserir onde está o cursor). Enquanto não houver modelo, a ficha não gera contrato.
          </span>
        </p>
      )}

      <section className="cartao flex flex-col gap-4 p-4 sm:flex-row sm:items-center">
        <div className="flex h-16 w-full shrink-0 items-center justify-center rounded-md bg-[var(--marca)] p-2 sm:w-48">
          {logo ? (
            <img src={logo} alt="Logo atual" className="max-h-12 max-w-full" />
          ) : (
            <span className="text-xl font-bold text-[var(--destaque)]">MDC</span>
          )}
        </div>
        <div className="min-w-0 flex-1 text-sm">
          <div className="font-medium">Layout MDC do contrato</div>
          <div className="text-xs text-[var(--texto-suave)]">
            Cabeçalho verde com a sua logo, títulos em verde e dourado, rodapé com CNPJ e contatos, numeração de páginas, campo de rubricas
            e assinaturas com duas testemunhas.
            {!logo &&
              (org.logo_url
                ? " A logo não pôde ser carregada aqui: envie o arquivo de novo (PNG branco com fundo transparente)."
                : " Ainda sem logo: envie o arquivo (PNG branco com fundo transparente).")}
          </div>
        </div>
        <label className={`btn shrink-0 cursor-pointer ${ocupado === "logo" ? "pointer-events-none opacity-60" : ""}`}>
          <Icone nome="enviar" className="h-4 w-4" />
          {ocupado === "logo" ? "Enviando…" : "Trocar logo"}
          <input
            type="file"
            accept="image/png,image/jpeg"
            className="sr-only"
            onChange={(e) => {
              const arq = e.target.files?.[0];
              e.target.value = "";
              if (arq) void trocarLogo(arq);
            }}
          />
        </label>
      </section>

      <div className="grid gap-5 xl:grid-cols-2">
        <section className="cartao space-y-3 p-4">
          <label className="campo">
            <span>Nome do modelo</span>
            <input value={nome} onChange={(e) => setNome(e.target.value)} />
          </label>
          <div>
            <p className="mb-1.5 text-xs text-[var(--texto-suave)]">Variáveis (clique para inserir; passe o mouse para ver o que é):</p>
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
          </div>
          <label className="campo">
            <span>Texto do contrato</span>
            <textarea
              ref={area}
              className="h-[420px] w-full font-mono text-[13px] md:h-[600px]"
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              placeholder="# CONTRATO DE PRESTAÇÃO DE SERVIÇOS CONTÁBEIS&#10;&#10;## CLÁUSULA PRIMEIRA – DO OBJETO&#10;…"
            />
          </label>
          <p className="text-xs text-[var(--texto-suave)]">
            Formatação: <code># título</code> · <code>## cláusula</code> · <code>- item de lista</code> · <code>**negrito**</code>.
            Cláusulas opcionais ({"{{clausula_13}}"}, {"{{clausula_implantacao}}"}, {"{{clausula_funcionarios}}"}) somem quando não se
            aplicam.
          </p>
        </section>
        <section className="space-y-2">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <Icone nome="olho" className="h-4 w-4 text-[var(--texto-suave)]" />
            Prévia com dados de exemplo
          </h2>
          {texto.trim() ? (
            <article
              className="prosa max-h-[760px] overflow-y-auto rounded-lg border border-[var(--borda)] bg-white p-5"
              dangerouslySetInnerHTML={{ __html: mdParaHtml(exemploTexto) }}
            />
          ) : (
            <p className="rounded-lg border border-dashed border-[var(--borda)] p-6 text-center text-sm text-[var(--texto-suave)]">
              A prévia aparece aqui assim que houver texto no modelo.
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
