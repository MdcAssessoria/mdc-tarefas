// Comercial › Ferramentas: as ferramentas ABERTAS do HUB (sem login, no domínio hub.mdcassessoria.com), como o
// Simulador de Regime. Cada cartão mostra o link oficial (com o canal de divulgação), Abrir, Copiar link, Enviar pelo
// WhatsApp, código para o site e quantos leads chegaram por ela. Catálogo em dominios/comercial/ferramentas.ts.
"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import { useOrg } from "@/dominios/organizacao/OrgProvider";
import { supabase } from "@/lib/supabase";
import { useConsulta } from "@/lib/useConsulta";
import { hojeISO } from "@/lib/datas";
import { plural } from "@/lib/formato/numero";
import { nomeArquivo } from "@/lib/arquivos/exportarLista";
import { useAviso } from "@/components/ui/Aviso";
import { BotoesExportar } from "@/components/ui/BotoesExportar";
import { CabecalhoPagina } from "@/components/ui/CabecalhoPagina";
import { Icone } from "@/components/ui/Icone";
import { CANAIS, FERRAMENTAS, codigoParaSite, linkFerramenta, linkWhatsappConvite } from "@/dominios/comercial/ferramentas";
import type { Ferramenta } from "@/dominios/comercial/ferramentas";

type Contagem = Record<string, { mes: number; total: number }>;

export default function PaginaFerramentas() {
  const { org } = useOrg();
  const { aviso, mostrar } = useAviso();
  const hoje = hojeISO(org.fuso);
  const inicioMes = `${hoje.slice(0, 8)}01T00:00:00-03:00`;

  const consulta = useConsulta(
    useCallback(async () => {
      const contagem: Contagem = {};
      for (const f of FERRAMENTAS) {
        const base = () =>
          supabase().from("crm_oportunidades").select("id", { count: "exact", head: true }).eq("org_id", org.id).eq("origem", f.origem);
        const [mes, total] = await Promise.all([base().gte("criado_em", inicioMes), base()]);
        if (mes.error) throw mes.error;
        if (total.error) throw total.error;
        contagem[f.id] = { mes: mes.count ?? 0, total: total.count ?? 0 };
      }
      return contagem;
    }, [org.id, inicioMes]),
  );

  async function copiar(texto: string, aviso: string) {
    try {
      await navigator.clipboard.writeText(texto);
      mostrar(aviso, "sucesso");
    } catch {
      mostrar("Não deu para copiar sozinho. Selecione o texto e copie com Ctrl+C.", "erro");
    }
  }

  return (
    <div className="space-y-4">
      <CabecalhoPagina
        titulo="Ferramentas abertas"
        descricao="Páginas gratuitas da MDC no endereço do HUB, abertas a qualquer pessoa sem login. Quem preenche entra sozinho no Funil como novo lead."
        acoes={
          <BotoesExportar
            vazio={false}
            avisar={mostrar}
            montar={() => ({
              titulo: "Ferramentas abertas",
              subtitulo: plural(FERRAMENTAS.length, "ferramenta"),
              arquivo: nomeArquivo("Ferramentas-abertas", hoje),
              logoUrl: org.logo_url,
              linhas: FERRAMENTAS,
              colunas: [
                { titulo: "Ferramenta", valor: (f: Ferramenta) => f.nome, peso: 1.6, largura: 30 },
                { titulo: "Link", valor: (f: Ferramenta) => linkFerramenta(f), peso: 2.6, largura: 60 },
                {
                  titulo: "Leads no mês",
                  valor: (f: Ferramenta) => consulta.dados?.[f.id]?.mes ?? "",
                  formato: "numero",
                  peso: 0.7,
                  largura: 14,
                },
                {
                  titulo: "Leads no total",
                  valor: (f: Ferramenta) => consulta.dados?.[f.id]?.total ?? "",
                  formato: "numero",
                  peso: 0.7,
                  largura: 14,
                },
              ],
            })}
          />
        }
      />
      {aviso}
      {consulta.erro && (
        <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-800">
          {consulta.erro}
        </p>
      )}
      <div className="grid gap-4 xl:grid-cols-2">
        {FERRAMENTAS.map((f) => (
          <CartaoFerramenta key={f.id} f={f} contagem={consulta.dados?.[f.id]} aoCopiar={copiar} />
        ))}
      </div>
      <p className="text-sm text-[var(--texto-suave)]">
        Quer outra ferramenta aberta (calculadora, checklist, diagnóstico)? Ela entra nesta lista com o mesmo endereço do HUB e os leads
        caem no mesmo Funil.
      </p>
    </div>
  );
}

function CartaoFerramenta({
  f,
  contagem,
  aoCopiar,
}: {
  f: Ferramenta;
  contagem?: { mes: number; total: number };
  aoCopiar: (texto: string, aviso: string) => void;
}) {
  const [canal, setCanal] = useState("");
  const link = linkFerramenta(f, canal);
  return (
    <section className="cartao space-y-4 p-5">
      <div className="flex items-start gap-3">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[var(--fundo)] text-[var(--marca)]">
          <Icone nome={f.icone} className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-semibold">{f.nome}</h2>
          <p className="text-sm text-[var(--texto-suave)]">{f.descricao}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-lg bg-[var(--fundo)] px-3 py-2">
          <span className="block text-xs text-[var(--texto-suave)]">Leads neste mês</span>
          <b className="num text-xl">{contagem ? contagem.mes : "…"}</b>
        </div>
        <div className="rounded-lg bg-[var(--fundo)] px-3 py-2">
          <span className="block text-xs text-[var(--texto-suave)]">Leads no total</span>
          <b className="num text-xl">{contagem ? contagem.total : "…"}</b>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-[minmax(0,12rem)_minmax(0,1fr)]">
        <label className="campo">
          <span>Onde vai divulgar</span>
          <select value={canal} onChange={(e) => setCanal(e.target.value)}>
            {CANAIS.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </select>
        </label>
        <label className="campo">
          <span>Link aberto (sem login)</span>
          <input readOnly value={link} onFocus={(e) => e.target.select()} className="font-mono text-xs" />
        </label>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        <a href={link} target="_blank" rel="noopener noreferrer" className="btn-primario justify-center">
          <Icone nome="externo" className="h-4 w-4" />
          Abrir
        </a>
        <button className="btn justify-center" onClick={() => aoCopiar(link, "Link copiado.")}>
          <Icone nome="copiar" className="h-4 w-4" />
          Copiar link
        </button>
        <a href={linkWhatsappConvite(f, link)} target="_blank" rel="noopener noreferrer" className="btn justify-center">
          <Icone nome="chat" className="h-4 w-4" />
          Enviar pelo WhatsApp
        </a>
        <button
          className="btn justify-center"
          onClick={() => aoCopiar(codigoParaSite(f, link), "Código copiado. No WordPress, cole num bloco “HTML personalizado”.")}
        >
          <Icone nome="documento" className="h-4 w-4" />
          Código para o site
        </button>
        <Link href="/comercial/leads" className="btn justify-center">
          <Icone nome="alvo" className="h-4 w-4" />
          Ver leads
        </Link>
      </div>
      <p className="text-xs text-[var(--texto-suave)]">
        O canal escolhido vai no link e aparece na ficha do lead em &quot;Como chegou&quot;, para saber de onde vêm os contatos.
      </p>
    </section>
  );
}
