// Sistemas › Sistemas e produtos: os sistemas que a MDC licencia (Ledgra ERP, EXato…; 088) e os módulos de cada um
// (preço de tabela mensal). Os pacotes têm tela própria desde a 091 (Sistemas › Pacotes de licença). Cadastrar e editar
// exige o nível gerir; nada se apaga (inativar tira das vendas novas; sistema "Fora de venda" não aceita licença nova).
"use client";

import { useState } from "react";
import { useOrg } from "@/dominios/organizacao/OrgProvider";
import { fmtData } from "@/lib/formato/datas";
import { traduzirErro } from "@/lib/erros";
import { Abas } from "@/components/ui/Abas";
import { Carregando } from "@/components/ui/Carregando";
import { EstadoVazio } from "@/components/ui/EstadoVazio";
import { Modal } from "@/components/ui/Modal";
import { useAviso } from "@/components/ui/Aviso";
import { BotoesExportar } from "@/components/ui/BotoesExportar";
import { nomeArquivo } from "@/lib/arquivos/exportarLista";
import { numeroBr, valorParaCampo } from "@/dominios/financeiro/regras";
import { Cabecalho, useDadosLicencas } from "@/dominios/licencas/componentes/Base";
import { TabelaPrecosProdutos } from "@/dominios/licencas/componentes/TabelasPrecos";
import { salvarProduto } from "@/dominios/licencas/repositorio";
import { JanelaSistema } from "@/dominios/licencas/componentes/JanelaSistema";
import { Icone } from "@/components/ui/Icone";
import { Chip } from "@/components/ui/Chip";
import { SITUACOES_SISTEMA, type Produto, type Sistema } from "@/dominios/licencas/tipos";

type Aba = "sistemas" | "modulos";

export default function PaginaProdutos() {
  const { org } = useOrg();
  const dados = useDadosLicencas();
  const { hoje, podeGerir, nomeSistema } = dados;
  const { aviso, mostrar } = useAviso();
  const [aba, setAba] = useState<Aba>("modulos");
  const [modulo, setModulo] = useState<Produto | "novo" | null>(null);
  const [sistema, setSistema] = useState<Sistema | "novo" | null>(null);
  const d = dados.dados;
  const emUso = (pred: (k: { plano_id: string | null; produtos: string[]; situacao: string; sistema: string }) => boolean) =>
    (d?.contratos ?? []).filter((k) => k.situacao === "ativo" && pred(k)).length;

  function fechar(msg?: string) {
    setModulo(null);
    setSistema(null);
    if (msg) {
      mostrar(msg);
      dados.recarregar();
    }
  }

  return (
    <div className="space-y-4">
      <Cabecalho
        titulo="Sistemas e produtos"
        descricao="Os sistemas que a MDC licencia e os módulos de cada um com o preço de tabela mensal. Os pacotes ficam em Pacotes de licença."
      >
        {d && aba === "modulos" && (
          <BotoesExportar
            vazio={!d.produtos.length}
            avisar={mostrar}
            montar={() => ({
              titulo: "Módulos dos sistemas",
              subtitulo: `${org.nome} · ${fmtData(hoje)}`,
              arquivo: nomeArquivo("Modulos-licenca", hoje),
              logoUrl: org.logo_url,
              paisagem: false,
              linhas: d.produtos,
              colunas: [
                { titulo: "Sistema", valor: (p) => nomeSistema(p.sistema), peso: 1, largura: 14 },
                { titulo: "Produto", valor: (p) => p.nome, peso: 2, largura: 28 },
                { titulo: "Código", valor: (p) => p.slug, peso: 1.2, largura: 16 },
                { titulo: "O que inclui", valor: (p) => p.descricao, peso: 3, largura: 50 },
                ...(podeGerir ? [{ titulo: "Preço mensal", valor: (p: Produto) => p.preco, formato: "moeda" as const, peso: 1.2 }] : []),
                { titulo: "Contratos ativos", valor: (p) => emUso((k) => k.produtos.includes(p.id)), formato: "numero", peso: 1 },
                { titulo: "Situação", valor: (p) => (p.ativo ? "À venda" : "Inativo"), peso: 1, largura: 12 },
              ],
            })}
          />
        )}
        {d && aba === "sistemas" && (
          <BotoesExportar
            vazio={!d.sistemas.length}
            avisar={mostrar}
            montar={() => ({
              titulo: "Sistemas licenciados",
              subtitulo: `${org.nome} · ${fmtData(hoje)}`,
              arquivo: nomeArquivo("Sistemas", hoje),
              logoUrl: org.logo_url,
              paisagem: false,
              linhas: d.sistemas,
              colunas: [
                { titulo: "Sistema", valor: (x) => x.nome, peso: 1.4, largura: 20 },
                { titulo: "Código", valor: (x) => x.slug, peso: 1, largura: 14 },
                { titulo: "Prefixo da chave", valor: (x) => x.prefixo, peso: 0.8, largura: 10 },
                { titulo: "Situação", valor: (x) => SITUACOES_SISTEMA.find((s) => s.id === x.situacao)?.nome ?? x.situacao, peso: 1, largura: 14 },
                { titulo: "Módulos", valor: (x) => d.produtos.filter((p) => p.sistema === x.slug && p.ativo).length, formato: "numero", peso: 0.8 },
                { titulo: "Licenças ativas", valor: (x) => emUso((k) => k.sistema === x.slug), formato: "numero", peso: 1 },
              ],
            })}
          />
        )}
        {podeGerir && d && (
          <button
            className="btn-primario"
            onClick={() => (aba === "sistemas" ? setSistema("novo") : setModulo("novo"))}
          >
            <Icone nome="novo" className="h-4 w-4" />
            {aba === "sistemas" ? "Novo sistema" : "Novo produto"}
          </button>
        )}
      </Cabecalho>

      <Abas<Aba>
        rotulo="Sistemas e produtos"
        valor={aba}
        aoMudar={setAba}
        itens={[
          { id: "sistemas", nome: "Sistemas" },
          { id: "modulos", nome: "Produtos" },
        ]}
      />
      {aviso}
      {dados.erro && <p className="rounded-md bg-red-50 p-3 text-sm text-red-800">{dados.erro}</p>}

      {!d ? (
        <Carregando />
      ) : aba === "sistemas" ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {d.sistemas.map((x) => {
            const sit = SITUACOES_SISTEMA.find((s) => s.id === x.situacao);
            return (
              <div key={x.id} className="cartao flex flex-col gap-2 p-4">
                <div className="flex items-start gap-2">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[var(--fundo)] text-[var(--marca)]">
                    <Icone nome="caixa" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <h2 className="font-semibold text-[var(--marca)]">{x.nome}</h2>
                    <p className="text-xs text-neutral-600">{x.descricao}</p>
                  </div>
                  <Chip tom={x.situacao === "vendendo" ? "verde" : x.situacao === "em_breve" ? "ambar" : "neutro"}>{sit?.nome}</Chip>
                </div>
                <p className="text-sm text-neutral-700">
                  {d.produtos.filter((p) => p.sistema === x.slug && p.ativo).length} módulo(s) ·{" "}
                  {emUso((k) => k.sistema === x.slug)} licença(s) ativa(s) · chave {x.prefixo}-…
                </p>
                {podeGerir && (
                  <button className="btn self-start" onClick={() => setSistema(x)}>
                    <Icone nome="editar" className="h-4 w-4" />
                    Editar
                  </button>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        !d.produtos.length ? (
          <EstadoVazio>Nenhum produto cadastrado. Cadastre os módulos de cada sistema com o preço mensal.</EstadoVazio>
        ) : (
          <>
            {podeGerir && d.produtos.some((p) => p.ativo && p.preco === 0) && (
              <p className="rounded-md bg-amber-50 p-3 text-sm text-amber-900">
                Há produto com preço zero. Defina o preço de tabela antes de cadastrar os contratos (o valor do contrato pode ter desconto).
              </p>
            )}
            {podeGerir ? (
              <TabelaPrecosProdutos
                produtos={d.produtos}
                org={org.id}
                emUso={(id) => emUso((k) => k.produtos.includes(id))}
                aoEditar={setModulo}
                aoSalvar={fechar}
                nomeSistema={nomeSistema}
              />
            ) : (
              <div className="cartao overflow-x-auto">
                <table className="tabela">
                  <thead>
                    <tr>
                      <th>Produto</th>
                      <th>Contratos ativos</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.produtos.map((p) => (
                      <tr key={p.id} className={p.ativo ? "" : "linha-apagada"}>
                        <td className="min-w-56">
                          <span className="font-medium">{p.nome}</span>
                          <span className="block text-xs text-neutral-500">{p.descricao}</span>
                        </td>
                        <td>{emUso((k) => k.produtos.includes(p.id))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )
      )}

      {modulo && d && (
        <EditarModulo
          modulo={modulo === "novo" ? null : modulo}
          sistemas={d.sistemas}
          org={org.id}
          aoFechar={() => fechar()}
          aoSalvar={fechar}
        />
      )}
      {sistema && <JanelaSistema sistema={sistema === "novo" ? null : sistema} org={org.id} aoFechar={() => fechar()} aoSalvar={fechar} />}
    </div>
  );
}

function EditarModulo({
  modulo,
  sistemas,
  org,
  aoFechar,
  aoSalvar,
}: {
  modulo: Produto | null;
  sistemas: Sistema[];
  org: string;
  aoFechar: () => void;
  aoSalvar: (m: string) => void;
}) {
  const [f, setF] = useState({
    nome: modulo?.nome ?? "",
    sistema: modulo?.sistema ?? "ledgra",
    slug: modulo?.slug ?? "",
    descricao: modulo?.descricao ?? "",
    preco: modulo ? valorParaCampo(modulo.preco) : "",
    ativo: modulo?.ativo ?? true,
  });
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);
  const mudar = (p: Partial<typeof f>) => setF((x) => ({ ...x, ...p }));

  async function salvar() {
    const preco = numeroBr(f.preco);
    if (!f.nome.trim()) return setErro("Informe o nome do produto.");
    if (!modulo && !/^[a-z0-9_-]{2,30}$/.test(f.slug))
      return setErro("Código: só letras minúsculas sem acento, números, hífen ou sublinhado.");
    if (Number.isNaN(preco) || preco < 0) return setErro("Informe o preço mensal (pode ser zero).");
    setSalvando(true);
    try {
      await salvarProduto({
        id: modulo?.id,
        org,
        slug: modulo ? undefined : f.slug,
        sistema: modulo ? undefined : f.sistema,
        nome: f.nome,
        descricao: f.descricao,
        preco,
        ativo: f.ativo,
      });
      aoSalvar(modulo ? "Produto atualizado. Assinaturas já fechadas mantêm o valor combinado." : "Produto cadastrado.");
    } catch (e) {
      setErro(traduzirErro(e));
      setSalvando(false);
    }
  }

  return (
    <Modal titulo={modulo ? "Editar produto" : "Novo produto"} aoFechar={aoFechar}>
      <label className="campo">
        <span>Sistema (não muda depois)</span>
        <select
          value={f.sistema}
          disabled={!!modulo}
          onChange={(e) => mudar({ sistema: e.target.value, slug: f.slug || `${e.target.value}-` })}
        >
          {sistemas.map((x) => (
            <option key={x.slug} value={x.slug}>
              {x.nome}
            </option>
          ))}
        </select>
      </label>
      <label className="campo">
        <span>Nome</span>
        <input value={f.nome} onChange={(e) => mudar({ nome: e.target.value })} autoFocus />
      </label>
      <label className="campo">
        <span>Código (usado nas regras de acesso; não muda depois)</span>
        <input
          value={f.slug}
          disabled={!!modulo}
          onChange={(e) => mudar({ slug: e.target.value.toLowerCase() })}
          placeholder={`ex.: ${f.sistema}-financeiro`}
        />
      </label>
      <label className="campo">
        <span>O que inclui</span>
        <textarea rows={2} value={f.descricao} onChange={(e) => mudar({ descricao: e.target.value })} />
      </label>
      <label className="campo">
        <span>Preço de tabela por mês (R$)</span>
        <input inputMode="decimal" value={f.preco} onChange={(e) => mudar({ preco: e.target.value })} placeholder="0,00" />
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={f.ativo} onChange={(e) => mudar({ ativo: e.target.checked })} /> À venda (desmarque para não
        oferecer em contratos novos)
      </label>
      {erro && <p className="rounded-md bg-red-50 p-2 text-sm text-red-800">{erro}</p>}
      <div className="flex justify-end gap-2 pt-2">
        <button className="btn" onClick={aoFechar}>
          Voltar
        </button>
        <button className="btn-primario" onClick={salvar} disabled={salvando}>
          {salvando ? "Salvando…" : "Salvar"}
        </button>
      </div>
    </Modal>
  );
}
