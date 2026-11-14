// Janelas do funil: cadastrar uma oportunidade e "Limpar funil" (arquivar de uma vez perdidas e paradas).
"use client";

import Link from "next/link";
import { useId, useState } from "react";
import { useOrg } from "@/dominios/organizacao/OrgProvider";
import { traduzirErro } from "@/lib/erros";
import { Icone } from "@/components/ui/Icone";
import { Modal } from "@/components/ui/Modal";
import { ETAPAS, ORIGENS } from "../crm";
import type { Etapa, Oportunidade } from "../crm";
import { criarOportunidade } from "../repositorio";
import { diasDesde, nomeEtapa, rotuloDias } from "../rotulos";

export function NovaOportunidade({ aoFechar, aoCriar }: { aoFechar: () => void; aoCriar: (id: string) => void }) {
  const { org, eu } = useOrg();
  const [f, setF] = useState({
    empresa: "",
    contato_nome: "",
    whatsapp: "",
    email: "",
    cnpj: "",
    cidade: "",
    uf: "SP",
    origem: "indicacao",
    valor_mensal: "",
  });
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const idForm = useId();
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  const vazio = (s: string) => s.trim() || null;

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setOcupado(true);
    setErro(null);
    try {
      const id = await criarOportunidade(org.id, eu.user_id, {
        empresa: f.empresa.trim(),
        contato_nome: vazio(f.contato_nome),
        whatsapp: vazio(f.whatsapp),
        email: vazio(f.email),
        cnpj: vazio(f.cnpj),
        cidade: vazio(f.cidade),
        uf: vazio(f.uf.toUpperCase()),
        origem: f.origem,
        valor_mensal: f.valor_mensal ? Number(f.valor_mensal.replace(/\./g, "").replace(",", ".")) || null : null,
      });
      aoCriar(id);
    } catch (e) {
      setErro(traduzirErro(e));
      setOcupado(false);
    }
  }

  return (
    <Modal
      titulo="Nova oportunidade"
      descricao="Cadastre uma empresa interessada. Ela entra no funil como “Novo lead” e você vira o responsável."
      aoFechar={aoFechar}
      largura="4xl"
      avisoRodape={
        erro && (
          <p role="alert" className="rounded-md bg-red-50 p-2 text-sm text-red-800">
            {erro}
          </p>
        )
      }
      rodape={
        <>
          <button type="button" className="btn" onClick={aoFechar}>
            Voltar
          </button>
          <button type="submit" form={idForm} className="btn-primario" disabled={ocupado}>
            <Icone nome="mais" className="h-4 w-4" />
            {ocupado ? "Criando…" : "Criar oportunidade"}
          </button>
        </>
      }
    >
      <form id={idForm} onSubmit={salvar} className="space-y-3">
        {/* computador: quatro campos por linha (a janela fica larga e baixa); celular: um embaixo do outro */}
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <label className="campo sm:col-span-2">
            <span>Empresa *</span>
            <input required value={f.empresa} onChange={set("empresa")} placeholder="Nome pelo qual a empresa é conhecida" />
          </label>
          <label className="campo">
            <span>Contato</span>
            <input value={f.contato_nome} onChange={set("contato_nome")} />
          </label>
          <label className="campo">
            <span>WhatsApp</span>
            <input inputMode="tel" value={f.whatsapp} onChange={set("whatsapp")} placeholder="(11) 99999-0000" />
          </label>
          <label className="campo">
            <span>E-mail</span>
            <input type="email" value={f.email} onChange={set("email")} />
          </label>
          <label className="campo">
            <span>CNPJ</span>
            <input inputMode="numeric" value={f.cnpj} onChange={set("cnpj")} />
          </label>
          <label className="campo">
            <span>Cidade</span>
            <input value={f.cidade} onChange={set("cidade")} />
          </label>
          <label className="campo">
            <span>UF</span>
            <input maxLength={2} value={f.uf} onChange={set("uf")} />
          </label>
          <label className="campo">
            <span>Como chegou até nós</span>
            <select value={f.origem} onChange={set("origem")}>
              {ORIGENS.filter((o) => o.id !== "simulador" && o.id !== "pessoal").map((o) => (
                <option key={o.id} value={o.id}>
                  {o.nome}
                </option>
              ))}
            </select>
          </label>
          <label className="campo">
            <span>Honorário estimado (R$/mês)</span>
            <input inputMode="decimal" value={f.valor_mensal} onChange={set("valor_mensal")} placeholder="Ex.: 1.200,00" />
          </label>
        </div>
        <p className="text-xs text-[var(--texto-suave)]">
          Quem preenche o Simulador de Regime entra no funil sozinho. O texto do contrato fica no{" "}
          <Link href="/comercial/modelo" className="underline">
            Modelo de contrato
          </Link>
          .
        </p>
      </form>
    </Modal>
  );
}

/** Dar baixa em lote: perdidas e oportunidades que não mudaram de etapa há X dias. Nada é apagado. */
export function LimparFunil({
  lista,
  aoFechar,
  aoConfirmar,
}: {
  lista: Oportunidade[];
  aoFechar: () => void;
  aoConfirmar: (ids: string[], motivo: string) => Promise<void>;
}) {
  const [perdidos, setPerdidos] = useState(true);
  const [parados, setParados] = useState(true);
  const [dias, setDias] = useState(30);
  const [etapas, setEtapas] = useState<Etapa[]>(["novo", "contato"]);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const alvo = lista.filter(
    (o) => (perdidos && o.etapa === "perdido") || (parados && etapas.includes(o.etapa) && diasDesde(o.etapa_desde) >= dias),
  );

  async function confirmar() {
    setOcupado(true);
    try {
      await aoConfirmar(
        alvo.map((o) => o.id),
        perdidos && !parados ? "Perdido" : "Sem avanço no funil",
      );
    } catch (e) {
      setErro(traduzirErro(e));
      setOcupado(false);
    }
  }

  return (
    <Modal
      titulo="Limpar funil"
      descricao="Arquiva de uma vez o que não vai para frente. Nada é apagado: fica em “Arquivados” e pode voltar ao funil."
      aoFechar={aoFechar}
      largura="lg"
      espaco={4}
    >
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          className="h-4 w-4 accent-[var(--marca)]"
          checked={perdidos}
          onChange={(e) => setPerdidos(e.target.checked)}
        />
        Oportunidades marcadas como perdidas
      </label>
      <div className="space-y-2">
        <label className="flex flex-wrap items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="h-4 w-4 accent-[var(--marca)]"
            checked={parados}
            onChange={(e) => setParados(e.target.checked)}
          />
          Paradas há pelo menos
          <input
            type="number"
            min={1}
            className="entrada !min-h-8 w-20"
            aria-label="Dias sem mudar de etapa"
            value={dias}
            onChange={(e) => setDias(Math.max(1, Number(e.target.value)))}
          />
          dias sem mudar de etapa em:
        </label>
        <div className="flex flex-wrap gap-3 pl-6 text-sm">
          {ETAPAS.filter((e) => !["ganho", "perdido"].includes(e.id)).map((e) => (
            <label key={e.id} className="flex items-center gap-1.5">
              <input
                type="checkbox"
                className="accent-[var(--marca)]"
                checked={etapas.includes(e.id)}
                onChange={(ev) => setEtapas((x) => (ev.target.checked ? [...x, e.id] : x.filter((y) => y !== e.id)))}
              />
              {e.nome}
            </label>
          ))}
        </div>
      </div>
      <div className="max-h-48 overflow-y-auto rounded-lg border border-[var(--borda)] text-sm">
        {alvo.length === 0 ? (
          <p className="p-3 text-[var(--texto-suave)]">Nada se encaixa nesses critérios.</p>
        ) : (
          alvo.map((o) => (
            <div key={o.id} className="flex justify-between gap-2 border-b border-[var(--borda)] px-3 py-1.5 last:border-0">
              <span className="truncate">{o.empresa}</span>
              <span className="shrink-0 text-xs text-[var(--texto-suave)]">
                {nomeEtapa(o.etapa)} · {rotuloDias(diasDesde(o.etapa_desde))}
              </span>
            </div>
          ))
        )}
      </div>
      {erro && (
        <p role="alert" className="rounded-md bg-red-50 p-2 text-sm text-red-800">
          {erro}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <button className="btn" onClick={aoFechar}>
          Voltar
        </button>
        <button className="btn-primario" disabled={!alvo.length || ocupado} onClick={confirmar}>
          <Icone nome="caixa" className="h-4 w-4" />
          {ocupado ? "Aguarde…" : `Arquivar ${alvo.length}`}
        </button>
      </div>
    </Modal>
  );
}
