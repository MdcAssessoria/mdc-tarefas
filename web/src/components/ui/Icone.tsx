// Ícones de traço simples (24×24, traço 1,7) usados no Hub. Ícone novo: desenhe no mesmo traço e acrescente aqui.
// O nome também pode vir do banco (hub_apps.icone); nome desconhecido mostra "grade" e avisa no console em desenvolvimento.
const P = {
  casa: <path d="M4 11l8-6.5 8 6.5V19a1.5 1.5 0 0 1-1.5 1.5H15v-6h-6v6H5.5A1.5 1.5 0 0 1 4 19z" />,
  busca: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="M16 16l4 4" />
    </>
  ),
  engrenagem: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2.8v2.4M12 18.8v2.4M4.6 4.6l1.7 1.7M17.7 17.7l1.7 1.7M2.8 12h2.4M18.8 12h2.4M4.6 19.4l1.7-1.7M17.7 6.3l1.7-1.7" />
    </>
  ),
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  sair: <path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4M10 16l4-4-4-4M14 12H4" />,
  recolher: <path d="M15 6l-6 6 6 6" />,
  expandir: <path d="M9 6l6 6-6 6" />,
  tv: (
    <>
      <rect x="3" y="5" width="18" height="12" rx="2" />
      <path d="M8 20h8" />
    </>
  ),
  mais: <path d="M12 5v14M5 12h14" />,
  celular: (
    <>
      <rect x="6.5" y="2.5" width="11" height="19" rx="2.5" />
      <path d="M10.5 18.5h3" />
    </>
  ),
  compartilhar: (
    <>
      <path d="M12 3.5v11M8 7.5l4-4 4 4" />
      <path d="M8.5 10.5H6.5a1.5 1.5 0 0 0-1.5 1.5v7a1.5 1.5 0 0 0 1.5 1.5h11a1.5 1.5 0 0 0 1.5-1.5v-7a1.5 1.5 0 0 0-1.5-1.5h-2" />
    </>
  ),
  adicionarTela: (
    <>
      <rect x="4" y="4" width="16" height="16" rx="3" />
      <path d="M12 8.5v7M8.5 12h7" />
    </>
  ),
  check: <path d="M4 12.5l5 5L20 6.5" />,
  pasta: <path d="M3 7.5a2 2 0 0 1 2-2h4l2 2.5h8a2 2 0 0 1 2 2V17a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />,
  grafico: (
    <>
      <path d="M4 20V4" />
      <path d="M4 20h16" />
      <path d="M8 16v-5M12 16V8M16 16v-3" />
    </>
  ),
  chat: <path d="M5 5h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-8l-5 4v-4H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z" />,
  relogio: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </>
  ),
  funil: <path d="M4 5h16l-6 8v5l-4 2v-7z" />,
  escudo: <path d="M12 3l7.5 3v5.5c0 4.5-3.2 8-7.5 9.5-4.3-1.5-7.5-5-7.5-9.5V6z" />,
  alvo: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="4.5" />
      <circle cx="12" cy="12" r="0.8" />
    </>
  ),
  moeda: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M14.8 9.2c-.5-.9-1.6-1.4-2.8-1.4-1.6 0-2.8.8-2.8 2s1.2 1.7 2.8 2 2.8.8 2.8 2.1-1.2 2.1-2.8 2.1c-1.3 0-2.4-.6-2.9-1.5M12 6.3v1.5M12 16.4v1.4" />
    </>
  ),
  grade: (
    <>
      <rect x="4" y="4" width="6.5" height="6.5" rx="1.5" />
      <rect x="13.5" y="4" width="6.5" height="6.5" rx="1.5" />
      <rect x="4" y="13.5" width="6.5" height="6.5" rx="1.5" />
      <rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.5" />
    </>
  ),
  sino: (
    <>
      <path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 1.5h-15z" />
      <path d="M10 20.5a2.2 2.2 0 0 0 4 0" />
    </>
  ),
  pessoas: (
    <>
      <circle cx="9" cy="8.5" r="3.2" />
      <path d="M3.5 19c.6-3 2.8-4.8 5.5-4.8s4.9 1.8 5.5 4.8" />
      <path d="M15.5 5.6a3.2 3.2 0 0 1 0 5.8M17.8 14.6c1.4.7 2.4 2.2 2.7 4.4" />
    </>
  ),
  externo: <path d="M14 4h6v6M20 4l-9 9M18 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4" />,
  clipe: <path d="M20 11.5l-8.2 8.2a5 5 0 0 1-7-7L13 4.5a3.4 3.4 0 0 1 4.8 4.8l-8.2 8.2a1.7 1.7 0 0 1-2.4-2.4L14.8 7.5" />,
  enviar: (
    <>
      <path d="M7 18.5H6a4 4 0 0 1-.6-7.95A6 6 0 0 1 17 8.6a4.5 4.5 0 0 1 1 8.9" />
      <path d="M12 12v8M8.8 15.2 12 12l3.2 3.2" />
    </>
  ),
  arquivo: (
    <>
      <path d="M7 3h7l5 5v11a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z" />
      <path d="M14 3v5h5" />
    </>
  ),
  fechar: <path d="M6 6l12 12M18 6 6 18" />,
  documento: (
    <>
      <path d="M7 3h7l5 5v11a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z" />
      <path d="M14 3v5h5M8.5 13h7M8.5 17h5" />
    </>
  ),
  // Financeiro e telas de lista
  "seta-entrada": <path d="M17 7 7 17M7 9v8h8" />,
  "seta-saida": <path d="M7 17 17 7M9 7h8v8" />,
  banco: (
    <>
      <path d="M3.5 9.5 12 4l8.5 5.5" />
      <path d="M5 10v7.5M9.5 10v7.5M14.5 10v7.5M19 10v7.5M3.5 20.5h17" />
    </>
  ),
  calendario: (
    <>
      <rect x="3.5" y="5" width="17" height="15.5" rx="2" />
      <path d="M3.5 9.5h17M8 3v4M16 3v4" />
    </>
  ),
  alerta: (
    <>
      <path d="M12 4 21 19.5H3z" />
      <path d="M12 10v4.5M12 17.2v.1" />
    </>
  ),
  caixa: (
    <>
      <path d="M3.5 7.5 12 3.5l8.5 4v9L12 20.5l-8.5-4z" />
      <path d="M3.5 7.5 12 11.5l8.5-4M12 11.5v9" />
    </>
  ),
  filtro: <path d="M4 6h16M7 12h10M10 18h4" />,
  planilha: (
    <>
      <rect x="4" y="4" width="16" height="16" rx="2" />
      <path d="M4 9.5h16M4 15h16M10 4v16" />
    </>
  ),
  baixar: <path d="M12 4v11M7.5 10.5 12 15l4.5-4.5M5 19.5h14" />,
  editar: <path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z M13.5 6.5l4 4" />,
  importar: (
    <>
      <path d="M12 15V4M7.5 8.5 12 4l4.5 4.5" />
      <path d="M5 14v4.5A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V14" />
    </>
  ),
  carteira: (
    <>
      <path d="M4 7.5A2.5 2.5 0 0 1 6.5 5H18v3" />
      <rect x="4" y="7.5" width="16.5" height="12" rx="2" />
      <path d="M16 13.5h1.5" />
    </>
  ),
  etiqueta: (
    <>
      <path d="M3.5 12V4.5a1 1 0 0 1 1-1H12l8.5 8.5-8.5 8.5z" />
      <circle cx="8" cy="8" r="1.3" />
    </>
  ),
  "chevron-baixo": <path d="M6 9.5l6 6 6-6" />,
  transferir: <path d="M4 8.5h15l-4-4M20 15.5H5l4 4" />,
  lista: <path d="M9 6.5h11M9 12h11M9 17.5h11M4.5 6.5h.1M4.5 12h.1M4.5 17.5h.1" />,
  tendencia: <path d="M3.5 16.5 9 11l4 4 7.5-7.5M15 7.5h5.5V13" />,
  // "Ver caminho": ramificação (de onde veio e para onde foi um documento)
  ramificacao: (
    <>
      <circle cx="6" cy="5.5" r="2" />
      <circle cx="6" cy="18.5" r="2" />
      <circle cx="18" cy="8.5" r="2" />
      <path d="M6 7.5v9M18 10.5v.5a4 4 0 0 1-4 4H8.5a2.5 2.5 0 0 0-2.5 1.5" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 11v5.5M12 7.8v.1" />
    </>
  ),
  // Ações de linha e de janela
  lixeira: (
    <>
      <path d="M4.5 6.5h15M9.5 6.5V4.5h5v2" />
      <path d="M6.5 6.5l.8 12.2a1.5 1.5 0 0 0 1.5 1.3h6.4a1.5 1.5 0 0 0 1.5-1.3l.8-12.2M10 10.5v6M14 10.5v6" />
    </>
  ),
  cancelar: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M6 6l12 12" />
    </>
  ),
  olho: (
    <>
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  copiar: (
    <>
      <rect x="8.5" y="8.5" width="11.5" height="11.5" rx="2" />
      <path d="M15.5 8.5V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v7.5a2 2 0 0 0 2 2h2.5" />
    </>
  ),
  voltar: <path d="M10 6l-6 6 6 6M4 12h16" />,
  imprimir: (
    <>
      <path d="M7 8.5V4h10v4.5" />
      <rect x="3.5" y="8.5" width="17" height="8" rx="2" />
      <path d="M7 14h10v6H7z" />
    </>
  ),
  atualizar: (
    <>
      <path d="M19.5 12a7.5 7.5 0 0 1-13.3 4.7M4.5 12a7.5 7.5 0 0 1 13.3-4.7" />
      <path d="M18 3.5v4h-4M6 20.5v-4h4" />
    </>
  ),
  // 04/11/2026: no lugar dos símbolos de texto (⋯, ▸, →, ▲/▼, ★) que apareciam na tela
  reticencias: (
    <>
      <circle cx="5.5" cy="12" r="1.2" fill="currentColor" />
      <circle cx="12" cy="12" r="1.2" fill="currentColor" />
      <circle cx="18.5" cy="12" r="1.2" fill="currentColor" />
    </>
  ),
  "chevron-direita": <path d="M9.5 6l6 6-6 6" />,
  "seta-direita": <path d="M4 12h16M14 6l6 6-6 6" />,
  "seta-cima": <path d="M12 20V4M6 10l6-6 6 6" />,
  "seta-baixo": <path d="M12 4v16M6 14l6 6 6-6" />,
  exclamacao: <path d="M12 5.5v8.5M12 18.4v.1" />,
  traco: <path d="M6 12h12" />,
  estrela: <path d="M12 3.6l2.6 5.3 5.8.8-4.2 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.2-4.1 5.8-.8z" />,
} satisfies Record<string, React.ReactNode>;

/** Nomes de ícone que existem. Use este tipo em props novas; `nome` aceita texto livre por causa do banco. */
export type NomeIcone = keyof typeof P;

const avisados = new Set<string>();

export function existeIcone(nome: string): nome is NomeIcone {
  return Object.prototype.hasOwnProperty.call(P, nome);
}

export function Icone({ nome, className = "h-5 w-5" }: { nome: NomeIcone | (string & {}); className?: string }) {
  const conhecido = existeIcone(nome);
  if (!conhecido && process.env.NODE_ENV !== "production" && !avisados.has(nome)) {
    avisados.add(nome);
    console.warn(`Icone: o nome "${nome}" não existe em components/ui/Icone.tsx; mostrando "grade".`);
  }
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      data-icone={conhecido ? nome : "grade"}
    >
      {conhecido ? P[nome] : P.grade}
    </svg>
  );
}
