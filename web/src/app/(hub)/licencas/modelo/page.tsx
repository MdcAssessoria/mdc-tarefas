// Licenças › Modelo do contrato (085): o texto das cláusulas do contrato de licença do Ledgra e do HUB, com as
// variáveis {{assim}} que o HUB preenche em cada licença. Começa no modelo-padrão (Lei 9.609/98, LGPD, MP 2.200-2);
// cada gravação vira uma versão nova e os contratos já emitidos não mudam. Só quem tem a permissão de valores grava.
"use client";

import { useCallback, useState } from "react";
import { useOrg } from "@/dominios/organizacao/OrgProvider";
import { useConsulta } from "@/lib/useConsulta";
import { traduzirErro } from "@/lib/erros";
import { fmtDataHora } from "@/lib/formato/datas";
import { hojeISO } from "@/lib/datas";
import { useAviso } from "@/components/ui/Aviso";
import { Carregando } from "@/components/ui/Carregando";
import { Icone } from "@/components/ui/Icone";
import { Cabecalho } from "@/dominios/licencas/componentes/Base";
import { MODELO_PADRAO, VARIAVEIS, conferirModelo, preencher, valoresDoContrato } from "@/dominios/licencas/contratoLicenca";
import { baixarContratoLicenca, lerModelo, lerVersoesModelo, salvarModelo } from "@/dominios/licencas/documentos";

export default function PaginaModeloContrato() {
  const { org, pode } = useOrg();
  const { aviso, mostrar } = useAviso();
  const consulta = useConsulta(
    useCallback(async () => {
      const [modelo, versoes] = await Promise.all([lerModelo(org.id), lerVersoesModelo(org.id)]);
      return { modelo, versoes };
    }, [org.id]),
  );
  return (
    <div className="space-y-4">
      <Cabecalho
        titulo="Modelo do contrato"
        descricao="O texto do contrato de licença do Ledgra e do HUB. As palavras entre {{ }} são trocadas pelos dados de cada licença na hora de emitir."
      />
      {aviso}
      {consulta.erro ? (
        <p className="rounded-md bg-red-50 p-2 text-sm text-red-800">{consulta.erro}</p>
      ) : !consulta.dados ? (
        <Carregando />
      ) : (
        <Editor
          key={consulta.dados.modelo.versao}
          inicial={consulta.dados.modelo}
          versoes={consulta.dados.versoes}
          podeGravar={pode("licencas", "gerir")}
          aoSalvar={(m) => {
            mostrar(m);
            consulta.recarregar();
          }}
        />
      )}
    </div>
  );
}

function Editor({
  inicial,
  versoes,
  podeGravar,
  aoSalvar,
}: {
  inicial: { texto: string; versao: number; atualizado_em: string | null; padrao: boolean };
  versoes: { versao: number; texto: string; em: string }[];
  podeGravar: boolean;
  aoSalvar: (msg: string) => void;
}) {
  const { org } = useOrg();
  const [texto, setTexto] = useState(inicial.texto);
  const [erro, setErro] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const mudou = texto !== inicial.texto;

  async function salvar() {
    const problema = conferirModelo(texto);
    if (problema) return setErro(problema);
    setErro("");
    setOcupado(true);
    try {
      const v = await salvarModelo(org.id, texto);
      aoSalvar(`Modelo salvo (versão ${v}). Os próximos contratos já saem com este texto; os emitidos não mudam.`);
    } catch (e) {
      setErro(traduzirErro(e));
    }
    setOcupado(false);
  }

  async function exemplo() {
    setErro("");
    try {
      const hoje = hojeISO(org.fuso);
      const produtos = new Map([
        ["a", { nome: "Ledgra · Financeiro", descricao: "Contas a pagar e a receber, bancos e conciliação", sistema: "ledgra" as const }],
        ["b", { nome: "Ledgra · Estoque", descricao: "Depósitos, lotes e posição do estoque", sistema: "ledgra" as const }],
      ]);
      const valores = valoresDoContrato({
        numero: "LIC-0000/0000",
        contrato: {
          modalidade: "pacote",
          plano_id: null,
          produtos: ["a", "b"],
          valor_mensal: 390,
          valor_tabela: 450,
          dia_vencimento: 10,
          inicio: hoje,
          fim: null,
          proporcional: true,
          reajuste_indice: "IPCA",
          reajuste_mes: 1,
        },
        cliente: { razao_social: "Empresa Exemplo Ltda", cnpj: "11222333000181", cidade: "Bragança Paulista", uf: "SP" },
        produtos,
        signatario: { nome: "Maria da Silva", cpf: "52998224725", cargo: "sócia-administradora", email: "" },
        modo: "eletronico",
        diasBloqueio: 30,
        hoje,
      });
      await baixarContratoLicenca({
        texto: preencher(texto, valores),
        numero: "exemplo",
        cliente: { razao_social: "Empresa Exemplo Ltda", cnpj: "11222333000181" },
        signatario: { nome: "Maria da Silva", cpf: "52998224725", cargo: "sócia-administradora", email: "" },
        logo: org.logo_url,
        minuta: true,
      });
    } catch (e) {
      setErro(traduzirErro(e));
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,1fr)]">
      <div className="space-y-3">
        <p className="text-sm text-neutral-600">
          {inicial.padrao
            ? "Este é o modelo-padrão do HUB (ainda não foi mudado). Recomendamos a revisão do advogado da MDC antes do primeiro uso."
            : `Versão ${inicial.versao}, salva em ${fmtDataHora(inicial.atualizado_em ?? "")}.`}{" "}
          Use <b># </b> no título, <b>## </b> em cada cláusula, <b>- </b> nos itens e <b>**negrito**</b>.
        </p>
        <label className="campo">
          <span>Texto do contrato</span>
          <textarea
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            readOnly={!podeGravar}
            rows={28}
            className="font-mono text-sm leading-relaxed"
            spellCheck
          />
        </label>
        {erro && <p className="rounded-md bg-red-50 p-2 text-sm text-red-800">{erro}</p>}
        <div className="flex flex-wrap justify-end gap-2">
          {podeGravar && texto !== MODELO_PADRAO && (
            <button className="btn" onClick={() => setTexto(MODELO_PADRAO)}>
              <Icone nome="atualizar" className="h-4 w-4" />
              Voltar ao modelo-padrão
            </button>
          )}
          {podeGravar && mudou && (
            <button className="btn" onClick={() => setTexto(inicial.texto)}>
              <Icone nome="voltar" className="h-4 w-4" />
              Desfazer mudanças
            </button>
          )}
          <button className="btn" onClick={exemplo}>
            <Icone nome="olho" className="h-4 w-4" />
            Ver exemplo (PDF)
          </button>
          {podeGravar && (
            <button className="btn-primario" onClick={salvar} disabled={ocupado || (!mudou && !inicial.padrao)}>
              <Icone nome="check" className="h-4 w-4" />
              {ocupado ? "Salvando…" : "Salvar modelo"}
            </button>
          )}
        </div>
      </div>
      <aside className="space-y-3">
        <div className="cartao space-y-2 p-4">
          <h2 className="font-semibold text-[var(--marca)]">Palavras que o HUB preenche</h2>
          <ul className="space-y-1.5 text-sm">
            {VARIAVEIS.map((v) => (
              <li key={v.chave}>
                <code className="rounded bg-[var(--fundo)] px-1">{`{{${v.chave}}}`}</code>
                <span className="block text-xs text-neutral-600">{v.explica}</span>
              </li>
            ))}
          </ul>
        </div>
        {versoes.length > 0 && (
          <div className="cartao space-y-2 p-4">
            <h2 className="font-semibold text-[var(--marca)]">Versões salvas</h2>
            <ul className="space-y-1.5 text-sm">
              {versoes.map((v) => (
                <li key={v.versao} className="flex items-center justify-between gap-2">
                  <span>
                    Versão {v.versao}
                    <span className="block text-xs text-neutral-600">{fmtDataHora(v.em)}</span>
                  </span>
                  {podeGravar && v.texto !== texto && (
                    <button className="btn !min-h-8 !px-3 text-xs" onClick={() => setTexto(v.texto)}>
                      <Icone nome="copiar" className="h-3.5 w-3.5" />
                      Usar este texto
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </aside>
    </div>
  );
}
