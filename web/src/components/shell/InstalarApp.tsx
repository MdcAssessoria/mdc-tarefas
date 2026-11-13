// "Instalar no celular": põe o HUB como aplicativo, com o ícone da MDC na tela do celular. No Android (e no Chrome do
// computador) o navegador instala com um toque (evento beforeinstallprompt). No iPhone a Apple não deixa o site instalar:
// o botão abre o passo a passo do Safari com os desenhos dos botões (Compartilhar › Adicionar à Tela de Início). Some quando
// o HUB já foi aberto pelo ícone. Aparece no menu lateral (equipe) e no topo do Portal do Cliente.
"use client";

import { useState, useSyncExternalStore } from "react";
import { Icone, type NomeIcone } from "@/components/ui/Icone";
import { Modal } from "@/components/ui/Modal";
import { caminho } from "@/lib/caminho";
import { abertoComoApp, navegadorIphone, plataforma, type NavegadorIphone, type Plataforma } from "@/lib/instalarApp";

interface PedidoInstalacao extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

// o navegador avisa uma vez só, logo no começo: guardar aqui, fora do componente
let pedido: PedidoInstalacao | null = null;
let instalado = false;
const ouvintes = new Set<() => void>();
const avisar = () => ouvintes.forEach((f) => f());
if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    pedido = e as PedidoInstalacao;
    avisar();
  });
  window.addEventListener("appinstalled", () => {
    instalado = true;
    pedido = null;
    avisar();
  });
}

interface Situacao {
  mostrar: boolean;
  plataforma: Plataforma;
  navegador: NavegadorIphone;
  podeInstalarDireto: boolean;
}

const NADA: Situacao = { mostrar: false, plataforma: "computador", navegador: "outro", podeInstalarDireto: false };
let ultima: Situacao = NADA;

function ler(): Situacao {
  const ua = navigator.userAgent;
  const pl = plataforma(ua, navigator.maxTouchPoints);
  const jaApp =
    instalado ||
    abertoComoApp(window.matchMedia?.("(display-mode: standalone)").matches ?? false, (navigator as { standalone?: boolean }).standalone);
  const podeInstalarDireto = !!pedido;
  const mostrar = !jaApp && (pl !== "computador" || podeInstalarDireto);
  const nav = navegadorIphone(ua);
  // mesma resposta = mesmo objeto (useSyncExternalStore compara por referência)
  if (
    ultima.mostrar !== mostrar ||
    ultima.plataforma !== pl ||
    ultima.navegador !== nav ||
    ultima.podeInstalarDireto !== podeInstalarDireto
  ) {
    ultima = { mostrar, plataforma: pl, navegador: nav, podeInstalarDireto };
  }
  return ultima;
}

function useSituacao(): Situacao {
  return useSyncExternalStore(
    (f) => {
      ouvintes.add(f);
      return () => ouvintes.delete(f);
    },
    ler,
    () => NADA,
  );
}

/** `menu`: linha do menu lateral (escuro); `portal`: botão do topo do Portal. */
export function BotaoInstalarApp({ variante, recolhido = false }: { variante: "menu" | "portal"; recolhido?: boolean }) {
  const s = useSituacao();
  const [aberto, setAberto] = useState(false);
  if (!s.mostrar) return null;

  async function instalar() {
    if (pedido) {
      const p = pedido;
      await p.prompt();
      const r = await p.userChoice.catch(() => null);
      if (r?.outcome === "accepted") {
        pedido = null;
        avisar();
      }
      return;
    }
    setAberto(true);
  }

  const rotulo = s.plataforma === "computador" ? "Instalar o app" : "Instalar no celular";
  return (
    <>
      {variante === "menu" ? (
        <button
          onClick={() => void instalar()}
          className={`mb-2 flex w-full items-center gap-2 rounded-lg bg-[var(--destaque)]/15 px-2 py-2 text-[13px] font-medium text-[var(--destaque)] hover:bg-[var(--destaque)]/25 ${recolhido ? "justify-center" : ""}`}
          aria-label={rotulo}
          title={rotulo}
        >
          <Icone nome="celular" className="h-[18px] w-[18px]" />
          {!recolhido && rotulo}
        </button>
      ) : (
        <button
          onClick={() => void instalar()}
          className="alvo-toque flex shrink-0 items-center gap-1.5 rounded-md border border-[var(--destaque)]/50 px-2.5 py-1 text-sm text-[var(--destaque)] hover:text-white"
          aria-label={rotulo}
        >
          <Icone nome="celular" className="h-4 w-4" />
          Instalar
        </button>
      )}
      {aberto && <JanelaInstalar situacao={s} aoFechar={() => setAberto(false)} />}
    </>
  );
}

function Passo({ n, icone, children }: { n: number; icone?: NomeIcone; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-3">
      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[var(--marca)] text-sm font-semibold text-[var(--destaque)]">
        {n}
      </span>
      <div className="min-w-0 flex-1 pt-0.5">{children}</div>
      {icone && (
        <span
          className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-[var(--borda)] bg-white text-[#007AFF]"
          aria-hidden
        >
          <Icone nome={icone} className="h-6 w-6" />
        </span>
      )}
    </li>
  );
}

function JanelaInstalar({ situacao, aoFechar }: { situacao: Situacao; aoFechar: () => void }) {
  const [copiado, setCopiado] = useState(false);
  const endereco = typeof window !== "undefined" ? window.location.origin + caminho("/") : "";
  const iphone = situacao.plataforma === "iphone";

  async function copiar() {
    try {
      await navigator.clipboard.writeText(endereco);
      setCopiado(true);
    } catch {
      setCopiado(false);
    }
  }

  return (
    <Modal
      titulo={iphone ? "Instalar no iPhone" : "Instalar no celular"}
      descricao="O HUB-MDC fica com ícone na tela, abre em tela cheia e continua com o seu login."
      aoFechar={aoFechar}
      largura="lg"
      rodape={
        <button type="button" className="btn-primario" onClick={aoFechar}>
          <Icone nome="check" className="h-4 w-4" />
          Entendi
        </button>
      }
    >
      <div className="space-y-4 text-sm text-[var(--texto)]">
        <div className="flex items-center gap-3 rounded-xl bg-[var(--fundo)] p-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={caminho("/icone-hub-mdc-180.png")} alt="" className="h-12 w-12 rounded-xl" />
          <p>
            Este é o ícone que vai aparecer na tela do celular, com o nome <b>HUB-MDC</b>.
          </p>
        </div>

        {iphone && situacao.navegador === "dentro_de_app" ? (
          <ol className="space-y-3">
            <Passo n={1} icone="externo">
              Você abriu o HUB por dentro de outro aplicativo. Toque em <b>•••</b> ou no ícone de bússola e escolha <b>Abrir no Safari</b>.
            </Passo>
            <Passo n={2} icone="copiar">
              Se não achar, copie o endereço e cole no Safari.
              <div className="mt-2">
                <button type="button" className="btn" onClick={() => void copiar()}>
                  <Icone nome={copiado ? "check" : "copiar"} className="h-4 w-4" />
                  {copiado ? "Endereço copiado" : "Copiar endereço"}
                </button>
              </div>
            </Passo>
            <Passo n={3}>No Safari, toque em Instalar no celular de novo para ver os próximos passos.</Passo>
          </ol>
        ) : iphone ? (
          <ol className="space-y-3">
            <Passo n={1} icone="compartilhar">
              Toque no botão <b>Compartilhar</b> (o quadrado com a seta para cima){" "}
              {situacao.navegador === "chrome" ? "no alto, ao lado do endereço." : "na barra de baixo do Safari."}
              <span className="mt-1 block text-[var(--texto-suave)]">
                Não aparece? Toque em <b>•••</b> (três pontinhos), no canto de baixo, e depois em <b>Compartilhar</b>.
              </span>
            </Passo>
            <Passo n={2} icone="adicionarTela">
              Role a lista para cima e toque em <b>Adicionar à Tela de Início</b>.
            </Passo>
            <Passo n={3} icone="check">
              Deixe ligado <b>Abrir como App Web</b>, se aparecer, e toque em <b>Adicionar</b>, no canto de cima.
            </Passo>
            <Passo n={4} icone="celular">
              Pronto: abra o HUB pelo ícone novo na tela do iPhone.
            </Passo>
          </ol>
        ) : (
          <ol className="space-y-3">
            <Passo n={1} icone="reticencias">
              No Chrome, toque nos <b>três pontinhos</b>, no canto de cima.
            </Passo>
            <Passo n={2} icone="adicionarTela">
              Toque em <b>Instalar app</b> ou em <b>Adicionar à tela inicial</b>.
            </Passo>
            <Passo n={3} icone="check">
              Confirme em <b>Instalar</b> e abra o HUB pelo ícone novo.
            </Passo>
          </ol>
        )}
      </div>
    </Modal>
  );
}
