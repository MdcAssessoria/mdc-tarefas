// Interação da verificação de telas para o Portal do Cliente: além da troca de período dos demonstrativos, abre a aba
// Faturas da MDC (050), confere a lista e abre a janela "Pagar" com a linha digitável e o Pix copia e cola.
import { trocarPeriodo } from "./interacoes-periodo.mjs";

export async function interacoesPortal(p, foto = async () => {}) {
  await trocarPeriodo(p, foto);
  await p.getByRole("button", { name: "Faturas da MDC" }).click();
  await p.getByRole("table", { name: "Faturas" }).waitFor({ timeout: 3000 }).catch(() => {
    throw new Error("a aba Faturas da MDC não mostrou a lista de faturas");
  });
  const largura = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  if (largura > 1) throw new Error(`a aba Faturas tem rolagem lateral de ${largura} px`);
  await foto("faturas");
  await p.getByRole("button", { name: "Pagar", exact: true }).first().click();
  const janela = p.getByRole("dialog", { name: /Pagar a fatura/ });
  await janela.waitFor({ timeout: 3000 });
  if (!(await janela.getByText("Linha digitável do boleto").count())) throw new Error("a janela Pagar não mostrou a linha digitável");
  await foto("faturas-pagar", { soTela: true });
  await janela.getByRole("button", { name: "Voltar" }).click();
  await janela.waitFor({ state: "detached", timeout: 3000 });
}
