// Licenças › Produtos e planos: os módulos do HUB que a MDC vende (preço de tabela mensal) e os planos (pacotes de
// módulos com preço próprio). Cadastrar e editar exige o nível gerir; nada se apaga (inativar tira das vendas novas).
"use client";

import { useState } from "react";
import { useOrg } from "@/dominios/organizacao/OrgProvider";
import { brl } from "@/lib/formato/moeda";
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
import { descontoSobreTabela } from "@/dominios/licencas/regras";
import { salvarPlano, salvarProduto } from "@/dominios/licencas/repositorio";
import type { Plano, Produto } from "@/dominios/licencas/tipos";

type Aba = "modulos" | "planos";

export default function PaginaProdutos() {
  const { org } = useOrg();
  const dados = useDadosLicencas();
  const { hoje, podeGerir } = dados;
  const { aviso, mostrar } = useAviso();
  const [aba, setAba] = useState<Aba>("modulos");
  const [modulo, setModulo] = useState<Produto | "novo" | null>(null);
  const [plano, setPlano] = useState<Plano | "novo" | null>(null);
  const d = dados.dados;
  const emUso = (pred: (k: { plano_id: string | null; produtos: string[]; situacao: string }) => boolean) =>
    (d?.contratos ?? []).filter((k) => k.situacao === "ativo" && pred(k)).length;
  const somaTabela = (p: Plano) => p.produtos.reduce((s, id) => s + (dados.produtos.get(id)?.preco ?? 0), 0);

  function fechar(msg?: string) {
    setModulo(null);
    setPlano(null);
    if (msg) {
      mostrar(msg);
      dados.recarregar();
    }
  }

  return (
    <div className="space-y-4">
      <Cabecalho
        titulo="Produtos e planos"
        descricao="Os produtos do Ledgra que a MDC cobra, com o preço de tabela mensal, e os pacotes (planos)."
      >
        {d && aba === "modulos" && (
          <BotoesExportar
            vazio={!d.produtos.length}
            avisar={mostrar}
            montar={() => ({
              titulo: "Produtos do Ledgra",
              subtitulo: `${org.nome} · ${fmtData(hoje)}`,
              arquivo: nomeArquivo("Modulos-licenca", hoje),
              logoUrl: org.logo_url,
              paisagem: false,
              linhas: d.produtos,
              colunas: [
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
        {d && aba === "planos" && (
          <BotoesExportar
            vazio={!d.planos.length}
            avisar={mostrar}
            montar={() => ({
              titulo: "Planos de licença",
              subtitulo: `${org.nome} · ${fmtData(hoje)}`,
              arquivo: nomeArquivo("Planos-licenca", hoje),
              logoUrl: org.logo_url,
              paisagem: false,
              linhas: d.planos,
              colunas: [
                { titulo: "Plano", valor: (p) => p.nome, peso: 1.6, largura: 24 },
                { titulo: "Produtos", valor: (p) => p.produtos.map((id) => dados.produtos.get(id)?.nome).join(", "), peso: 3, largura: 50 },
                ...(podeGerir
                  ? [
                      { titulo: "Preço mensal", valor: (p: Plano) => p.preco, formato: "moeda" as const, peso: 1.2 },
                      { titulo: "Avulsos somariam", valor: (p: Plano) => somaTabela(p), formato: "moeda" as const, peso: 1.2 },
                    ]
                  : []),
                { titulo: "Contratos ativos", valor: (p) => emUso((k) => k.plano_id === p.id), formato: "numero", peso: 1 },
                { titulo: "Situação", valor: (p) => (p.ativo ? "À venda" : "Inativo"), peso: 1, largura: 12 },
              ],
            })}
          />
        )}
        {podeGerir && d && (
          <button className="btn-primario" onClick={() => (aba === "modulos" ? setModulo("novo") : setPlano("novo"))}>
            {aba === "modulos" ? "Novo produto" : "Novo plano"}
          </button>
        )}
      </Cabecalho>

      <Abas<Aba>
        rotulo="Produtos e planos"
        valor={aba}
        aoMudar={setAba}
        itens={[
          { id: "modulos", nome: "Produtos" },
          { id: "planos", nome: "Planos (pacotes)" },
        ]}
      />
      {aviso}
      {dados.erro && <p className="rounded-md bg-red-50 p-3 text-sm text-red-800">{dados.erro}</p>}

      {!d ? (
        <Carregando />
      ) : aba === "modulos" ? (
        !d.produtos.length ? (
          <EstadoVazio>Nenhum produto cadastrado. Cadastre os produtos do Ledgra com o preço mensal.</EstadoVazio>
        ) : (
          <>
            {podeGerir && d.produtos.some((p) => p.ativo && p.preco === 0) && (
              <p className="rounded-md bg-amber-50 p-3 text-sm text-amber-900">
                Há produto com preço zero. Defina o preço de tabela antes de cadastrar os contratos (o valor do contrato pode ter desconto).
              </p>
            )}
            <div className="cartao overflow-x-auto">
              <table className="tabela tabela-acoes-fixas">
                <thead>
                  <tr>
                    <th>Produto</th>
                    {podeGerir && <th className="text-right">Preço mensal</th>}
                    <th>Contratos ativos</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {d.produtos.map((p) => (
                    <tr key={p.id} className={p.ativo ? "" : "linha-apagada"}>
                      <td className="min-w-56">
                        <span className="font-medium">{p.nome}</span>{" "}
                        {!p.ativo && <span className="chip bg-neutral-100 text-neutral-600">Inativo</span>}
                        <span className="block text-xs text-neutral-500">{p.descricao}</span>
                      </td>
                      {podeGerir && <td className="whitespace-nowrap text-right tabular-nums">{brl(p.preco)}</td>}
                      <td>{emUso((k) => k.produtos.includes(p.id))}</td>
                      <td className="text-right">
                        {podeGerir && (
                          <button className="btn !min-h-8" onClick={() => setModulo(p)}>
                            Editar
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )
      ) : !d.planos.length ? (
        <EstadoVazio
          acao={
            podeGerir && (
              <button className="btn-primario" onClick={() => setPlano("novo")}>
                Criar o primeiro plano
              </button>
            )
          }
        >
          Nenhum plano ainda. Um plano junta produtos com um preço mais em conta.
        </EstadoVazio>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {d.planos.map((p) => {
            const soma = somaTabela(p);
            return (
              <div key={p.id} className={`cartao space-y-2 p-4 ${p.ativo ? "" : "linha-apagada"}`}>
                <div className="flex items-start gap-2">
                  <div className="mr-auto">
                    <h2 className="font-semibold text-[var(--marca)]">
                      {p.nome} {!p.ativo && <span className="chip bg-neutral-100 text-neutral-600">Inativo</span>}
                    </h2>
                    {p.descricao && <p className="text-sm text-neutral-600">{p.descricao}</p>}
                  </div>
                  {podeGerir && (
                    <p className="text-right text-lg font-semibold tabular-nums">
                      {brl(p.preco)}
                      <span className="block text-xs font-normal text-neutral-500">por mês</span>
                    </p>
                  )}
                </div>
                <p className="text-sm">{p.produtos.map((id) => dados.produtos.get(id)?.nome).join(" · ")}</p>
                <p className="text-xs text-neutral-500">
                  {podeGerir && (
                    <>
                      Avulsos somariam {brl(soma)}
                      {descontoSobreTabela(soma, p.preco) > 0
                        ? ` (economia de ${descontoSobreTabela(soma, p.preco).toLocaleString("pt-BR")}%)`
                        : ""}{" "}
                      ·{" "}
                    </>
                  )}
                  {emUso((k) => k.plano_id === p.id)} contrato(s) ativo(s)
                </p>
                {podeGerir && (
                  <button className="btn !min-h-8" onClick={() => setPlano(p)}>
                    Editar
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {modulo && <EditarModulo modulo={modulo === "novo" ? null : modulo} org={org.id} aoFechar={() => fechar()} aoSalvar={fechar} />}
      {plano && d && (
        <EditarPlano
          plano={plano === "novo" ? null : plano}
          produtos={d.produtos}
          org={org.id}
          aoFechar={() => fechar()}
          aoSalvar={fechar}
        />
      )}
    </div>
  );
}

function EditarModulo({
  modulo,
  org,
  aoFechar,
  aoSalvar,
}: {
  modulo: Produto | null;
  org: string;
  aoFechar: () => void;
  aoSalvar: (m: string) => void;
}) {
  const [f, setF] = useState({
    nome: modulo?.nome ?? "",
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
        <span>Nome</span>
        <input value={f.nome} onChange={(e) => mudar({ nome: e.target.value })} autoFocus />
      </label>
      <label className="campo">
        <span>Código (usado nas regras de acesso; não muda depois)</span>
        <input
          value={f.slug}
          disabled={!!modulo}
          onChange={(e) => mudar({ slug: e.target.value.toLowerCase() })}
          placeholder="ex.: financeiro"
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

function EditarPlano({
  plano,
  produtos,
  org,
  aoFechar,
  aoSalvar,
}: {
  plano: Plano | null;
  produtos: Produto[];
  org: string;
  aoFechar: () => void;
  aoSalvar: (m: string) => void;
}) {
  const [f, setF] = useState({
    nome: plano?.nome ?? "",
    descricao: plano?.descricao ?? "",
    preco: plano ? valorParaCampo(plano.preco) : "",
    ativo: plano?.ativo ?? true,
    produtos: plano?.produtos ?? ([] as string[]),
  });
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);
  const mudar = (p: Partial<typeof f>) => setF((x) => ({ ...x, ...p }));
  const soma = produtos.filter((p) => f.produtos.includes(p.id)).reduce((s, p) => s + p.preco, 0);

  async function salvar() {
    const preco = numeroBr(f.preco);
    if (!f.nome.trim()) return setErro("Informe o nome do plano.");
    if (!f.produtos.length) return setErro("Marque ao menos um produto.");
    if (Number.isNaN(preco) || preco < 0) return setErro("Informe o preço mensal do plano.");
    setSalvando(true);
    try {
      await salvarPlano({ id: plano?.id, org, nome: f.nome, descricao: f.descricao, preco, ativo: f.ativo, produtos: f.produtos });
      aoSalvar(plano ? "Plano atualizado. Assinaturas já fechadas continuam com os produtos e o valor combinados." : "Plano criado.");
    } catch (e) {
      setErro(traduzirErro(e));
      setSalvando(false);
    }
  }

  return (
    <Modal titulo={plano ? "Editar plano" : "Novo plano"} aoFechar={aoFechar} largura="lg">
      <label className="campo">
        <span>Nome</span>
        <input value={f.nome} onChange={(e) => mudar({ nome: e.target.value })} autoFocus />
      </label>
      <label className="campo">
        <span>Descrição</span>
        <input value={f.descricao} onChange={(e) => mudar({ descricao: e.target.value })} />
      </label>
      <fieldset className="space-y-1">
        <legend className="text-sm text-neutral-600">Produtos do plano</legend>
        <div className="grid gap-1 sm:grid-cols-2">
          {produtos
            .filter((p) => p.ativo || f.produtos.includes(p.id))
            .map((p) => (
              <label key={p.id} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={f.produtos.includes(p.id)}
                  onChange={(e) => mudar({ produtos: e.target.checked ? [...f.produtos, p.id] : f.produtos.filter((x) => x !== p.id) })}
                />
                {p.nome} <span className="text-xs text-neutral-500">({brl(p.preco)})</span>
              </label>
            ))}
        </div>
      </fieldset>
      <label className="campo">
        <span>Preço do plano por mês (R$)</span>
        <input inputMode="decimal" value={f.preco} onChange={(e) => mudar({ preco: e.target.value })} placeholder={valorParaCampo(soma)} />
      </label>
      <p className="text-xs text-neutral-600">Os produtos avulsos somariam {brl(soma)} por mês.</p>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={f.ativo} onChange={(e) => mudar({ ativo: e.target.checked })} /> À venda
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
