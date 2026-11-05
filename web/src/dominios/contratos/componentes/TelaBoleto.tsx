// Contratos › Boleto (049): as contas da MDC no Ledgra Link para o boleto das faturas, uma por banco (Itaú e
// Santander). Para cada banco: o código da conta no Ledgra Link, a conta bancária do Financeiro onde o dinheiro cai (a
// baixa automática entra nela), boleto com Pix ou simples e ligado/desligado. Só quem gere Contratos (navegacao.ts).
// Embaixo, os boletos já emitidos (PDF e Excel).
"use client";

import { useCallback, useState } from "react";
import { useOrg } from "@/dominios/organizacao/OrgProvider";
import { nomeCliente } from "@/dominios/clientes/nome";
import { SemEmpresaGestao, useClienteGestao } from "@/dominios/organizacao/componentes/EmpresaEmGestao";
import { useConsulta } from "@/lib/useConsulta";
import { hojeISO } from "@/lib/datas";
import { traduzirErro } from "@/lib/erros";
import { brl } from "@/lib/formato/moeda";
import { fmtData, fmtDataHora } from "@/lib/formato/datas";
import { nomeArquivo } from "@/lib/arquivos/exportarLista";
import { CabecalhoPagina } from "@/components/ui/CabecalhoPagina";
import { BotoesExportar } from "@/components/ui/BotoesExportar";
import { Chip } from "@/components/ui/Chip";
import { EstadoVazio } from "@/components/ui/EstadoVazio";
import { Esqueleto } from "@/components/ui/Esqueleto";
import { Icone } from "@/components/ui/Icone";
import { QuadroTabela } from "@/components/ui/QuadroTabela";
import { useAviso } from "@/components/ui/Aviso";
import { BANCOS_BOLETO } from "../faturamento";
import { lerBoletos, lerContasBanco, lerFaturas, lerOpcoesContrato } from "../leituras";
import { salvarContaBanco } from "../repositorio";
import type { BancoBoleto, ContaBancoLink } from "../tipos";
import { SITUACOES_BOLETO_EMITIDO } from "./JanelaBoleto";
import { plural } from "@/lib/formato/numero";

interface FormBanco {
  conta_link_id: string;
  fin_conta: string;
  tipo: "boleto" | "boleto_hibrido";
  ativo: boolean;
}

function CartaoBanco({
  banco,
  atual,
  contas,
  podeGerir,
  aoSalvar,
}: {
  banco: (typeof BANCOS_BOLETO)[number];
  atual: ContaBancoLink | undefined;
  contas: { id: string; nome: string; ativo: boolean }[];
  podeGerir: boolean;
  aoSalvar: (msg: string) => void;
}) {
  const [f, setF] = useState<FormBanco>({
    conta_link_id: atual?.conta_link_id ?? "",
    fin_conta: atual?.fin_conta_id ?? "",
    tipo: atual?.tipo ?? "boleto_hibrido",
    ativo: atual?.ativo ?? true,
  });
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const mudar = (p: Partial<FormBanco>) => setF((x) => ({ ...x, ...p }));

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setErro("");
    if (!f.conta_link_id.trim()) return setErro("Informe o código da conta no Ledgra Link.");
    if (!f.fin_conta) return setErro("Escolha a conta bancária do Financeiro.");
    setSalvando(true);
    try {
      await salvarContaBanco({
        banco: banco.id as BancoBoleto,
        conta_link_id: f.conta_link_id.trim(),
        fin_conta: f.fin_conta,
        tipo: f.tipo,
        ativo: f.ativo,
      });
      aoSalvar(`${banco.nome}: configuração salva.`);
    } catch (x) {
      setErro(traduzirErro(x));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <form onSubmit={salvar} className="cartao space-y-3 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="grid h-9 w-9 place-items-center rounded-full bg-[var(--fundo)] text-[var(--marca)]">
          <Icone nome="banco" className="h-5 w-5" />
        </span>
        <h2 className="text-base font-semibold">{banco.nome}</h2>
        <span className="text-xs text-[var(--texto-suave)]">banco {banco.codigo}</span>
        <span className="ml-auto">
          {atual ? (
            <Chip tom={atual.ativo ? "verde" : "neutro"}>{atual.ativo ? "Ligado" : "Desligado"}</Chip>
          ) : (
            <Chip tom="ambar">Não configurado</Chip>
          )}
        </span>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="campo">
          <span>Código da conta no Ledgra Link</span>
          <input
            required
            value={f.conta_link_id}
            onChange={(e) => mudar({ conta_link_id: e.target.value })}
            disabled={!podeGerir}
            placeholder="Copie do painel do Ledgra Link"
            className="num"
          />
        </label>
        <label className="campo">
          <span>Conta do Financeiro onde o dinheiro cai</span>
          <select required value={f.fin_conta} onChange={(e) => mudar({ fin_conta: e.target.value })} disabled={!podeGerir}>
            <option value="">Escolha a conta…</option>
            {contas
              .filter((c) => c.ativo || c.id === f.fin_conta)
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
          </select>
        </label>
        <label className="campo">
          <span>Tipo</span>
          <select value={f.tipo} onChange={(e) => mudar({ tipo: e.target.value as FormBanco["tipo"] })} disabled={!podeGerir}>
            <option value="boleto_hibrido">Boleto com Pix (o cliente escolhe)</option>
            <option value="boleto">Só boleto</option>
          </select>
        </label>
        <label className="flex items-center gap-2 self-end pb-2 text-sm">
          <input type="checkbox" checked={f.ativo} onChange={(e) => mudar({ ativo: e.target.checked })} disabled={!podeGerir} />
          Ligado (os contratos com este banco já podem gerar boleto)
        </label>
      </div>
      {atual && <p className="text-xs text-[var(--texto-suave)]">Atualizado em {fmtDataHora(atual.atualizado_em)}.</p>}
      {erro && <p className="rounded-md bg-red-50 p-2 text-sm text-red-800">{erro}</p>}
      {podeGerir && (
        <div className="flex justify-end">
          <button type="submit" className="btn" disabled={salvando}>
            <Icone nome="check" className="h-4 w-4" />
            {salvando ? "Salvando…" : `Salvar ${banco.nome}`}
          </button>
        </div>
      )}
    </form>
  );
}

export function TelaBoleto() {
  const { org, pode } = useOrg();
  const { cliente } = useClienteGestao();
  const podeGerir = pode("contratos", "gerir");
  const { aviso, mostrar } = useAviso();
  const hoje = hojeISO(org.fuso);

  const consulta = useConsulta(
    useCallback(async () => {
      if (!cliente) return null;
      const [config, contas, boletos, faturas] = await Promise.all([
        lerContasBanco(cliente.id),
        lerOpcoesContrato(cliente.id).then((o) => o.contas),
        lerBoletos(cliente.id),
        lerFaturas(cliente.id),
      ]);
      return { config, contas, boletos, numero: new Map(faturas.map((f) => [f.id, f.numero])) };
    }, [cliente]),
  );
  const d = consulta.dados;

  if (!cliente) return <SemEmpresaGestao icone="banco" />;

  return (
    <div className="space-y-4">
      <CabecalhoPagina
        titulo="Boleto"
        descricao="As contas da MDC no Ledgra Link para o boleto das faturas, no Itaú e no Santander. Quando o cliente paga, o banco avisa e a baixa entra sozinha no Financeiro."
        acoes={
          <BotoesExportar
            vazio={!d?.boletos.length}
            avisar={mostrar}
            montar={() => ({
              titulo: "Boletos das faturas",
              subtitulo: `${nomeCliente(cliente)} · ${plural(d?.boletos.length ?? 0, "boleto")}`,
              arquivo: nomeArquivo("Boletos", nomeCliente(cliente), hoje),
              logoUrl: org.logo_url,
              linhas: d?.boletos ?? [],
              colunas: [
                { titulo: "Fatura", valor: (b) => d?.numero.get(b.fatura_id) ?? "—", peso: 1, largura: 12 },
                { titulo: "Banco", valor: (b) => BANCOS_BOLETO.find((x) => x.id === b.banco)?.nome ?? b.banco, peso: 0.8, largura: 12 },
                { titulo: "Vencimento", valor: (b) => fmtData(b.vencimento), peso: 0.9, largura: 12 },
                { titulo: "Valor", valor: (b) => Number(b.valor), formato: "moeda", peso: 1 },
                { titulo: "Situação", valor: (b) => SITUACOES_BOLETO_EMITIDO[b.situacao].nome, peso: 1.2, largura: 22 },
                { titulo: "Gerado em", valor: (b) => fmtDataHora(b.emitido_em), peso: 1, largura: 18 },
              ],
            })}
          />
        }
      />
      {aviso}
      <p className="flex items-start gap-2 rounded-xl border border-[var(--borda)] bg-[var(--fundo)] p-3 text-sm">
        <Icone nome="info" className="mt-0.5 h-5 w-5 shrink-0 text-[var(--marca)]" />
        <span>
          Antes de ligar um banco, a conta da MDC nesse banco precisa estar cadastrada no Ledgra Link (com as credenciais de cobrança do
          banco). O código da conta aparece no painel do Ledgra Link. Cada contrato escolhe o banco do boleto no próprio cadastro.
        </span>
      </p>
      {consulta.erro && <p className="rounded-md bg-red-50 p-3 text-sm text-red-800">{consulta.erro}</p>}
      {!d ? (
        !consulta.erro && <Esqueleto linhas={6} />
      ) : (
        <>
          <div className="grid gap-4 lg:grid-cols-2">
            {BANCOS_BOLETO.map((b) => (
              <CartaoBanco
                key={`${b.id}-${d.config.find((x) => x.banco === b.id)?.atualizado_em ?? "novo"}`}
                banco={b}
                atual={d.config.find((x) => x.banco === b.id)}
                contas={d.contas}
                podeGerir={podeGerir}
                aoSalvar={(msg) => {
                  mostrar(msg);
                  consulta.recarregar();
                }}
              />
            ))}
          </div>
          <h2 className="pt-2 text-base font-semibold">Boletos emitidos</h2>
          {!d.boletos.length ? (
            <EstadoVazio icone="banco" titulo="Nenhum boleto emitido ainda">
              Em Contratos › Faturas, clique no botão do banco de uma fatura para gerar o boleto.
            </EstadoVazio>
          ) : (
            <QuadroTabela>
              <thead>
                <tr>
                  <th>Fatura</th>
                  <th>Banco</th>
                  <th>Vencimento</th>
                  <th className="text-right">Valor</th>
                  <th>Situação</th>
                </tr>
              </thead>
              <tbody>
                {d.boletos.map((b) => (
                  <tr key={b.id}>
                    <td data-rotulo="Fatura" className="celula-titulo font-medium">
                      {d.numero.get(b.fatura_id) ?? "—"}
                      {b.tentativa > 1 && <span className="block text-xs text-[var(--texto-suave)]">{b.tentativa}ª tentativa</span>}
                    </td>
                    <td data-rotulo="Banco">{BANCOS_BOLETO.find((x) => x.id === b.banco)?.nome ?? b.banco}</td>
                    <td data-rotulo="Vencimento">{fmtData(b.vencimento)}</td>
                    <td data-rotulo="Valor" className="text-right">
                      {brl(Number(b.valor))}
                    </td>
                    <td data-rotulo="Situação">
                      <Chip tom={SITUACOES_BOLETO_EMITIDO[b.situacao].tom}>{SITUACOES_BOLETO_EMITIDO[b.situacao].nome}</Chip>
                    </td>
                  </tr>
                ))}
              </tbody>
            </QuadroTabela>
          )}
        </>
      )}
    </div>
  );
}
