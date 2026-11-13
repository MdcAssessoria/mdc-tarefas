// Instalar o HUB como aplicativo (ícone na tela do celular): descobre o aparelho e o navegador pelo userAgent para mostrar
// o passo a passo certo. No iPhone a Apple não deixa o site instalar sozinho: a pessoa usa Compartilhar › Adicionar à Tela
// de Início, e isso só existe no Safari (e no Chrome do iPhone, pelo mesmo menu). Navegador de dentro de outro app
// (Instagram, Facebook, Gmail…) não tem a opção: pede para abrir no Safari.

export type Plataforma = "iphone" | "android" | "computador";
export type NavegadorIphone = "safari" | "chrome" | "dentro_de_app" | "outro";

/** `toques` = navigator.maxTouchPoints: o iPad novo se apresenta como Mac, mas tem toque. */
export function plataforma(ua: string, toques = 0): Plataforma {
  if (/iPhone|iPad|iPod/i.test(ua)) return "iphone";
  if (/Macintosh/i.test(ua) && toques > 1) return "iphone";
  if (/Android/i.test(ua)) return "android";
  return "computador";
}

export function navegadorIphone(ua: string): NavegadorIphone {
  if (/FBAN|FBAV|Instagram|Line\/|GSA\/|LinkedInApp|Twitter|MicroMessenger/i.test(ua)) return "dentro_de_app";
  if (/CriOS/i.test(ua)) return "chrome";
  if (/FxiOS|EdgiOS|OPiOS|DuckDuckGo/i.test(ua)) return "outro";
  if (/Safari/i.test(ua)) return "safari";
  return "dentro_de_app";
}

/** Já aberto como aplicativo (pelo ícone)? `standalone` = display-mode: standalone; `iosStandalone` = navigator.standalone. */
export function abertoComoApp(standalone: boolean, iosStandalone?: boolean): boolean {
  return standalone || iosStandalone === true;
}
