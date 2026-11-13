// Testa os links das ferramentas abertas: endereço oficial, canal (utm_source), convite do WhatsApp e código do site.
import { describe, expect, it } from "vitest";
import { FERRAMENTAS, codigoParaSite, linkFerramenta, linkWhatsappConvite } from "./ferramentas";

const sim = FERRAMENTAS[0];

describe("ferramentas abertas", () => {
  it("link oficial no domínio do HUB, com e sem canal", () => {
    expect(linkFerramenta(sim)).toBe("https://hub.mdcassessoria.com/hub-mdc/ferramentas/simulador-regime");
    expect(linkFerramenta(sim, "instagram")).toBe(
      "https://hub.mdcassessoria.com/hub-mdc/ferramentas/simulador-regime?utm_source=instagram",
    );
    expect(linkFerramenta(sim, "", "http://localhost:3000/")).toBe("http://localhost:3000/hub-mdc/ferramentas/simulador-regime");
  });
  it("convite do WhatsApp leva o texto e o link codificados", () => {
    const url = linkWhatsappConvite(sim, "https://x.com/a?b=1");
    expect(url.startsWith("https://wa.me/?text=")).toBe(true);
    expect(decodeURIComponent(url.slice(20))).toBe(`${sim.convite}\nhttps://x.com/a?b=1`);
  });
  it("código do site embute o link e ajusta a altura", () => {
    const c = codigoParaSite(sim, "https://l");
    expect(c).toContain('src="https://l"');
    expect(c).toContain('getElementById("mdc-simulador-regime")');
  });
  it("cada ferramenta tem id de endereço e origem do CRM", () => {
    for (const f of FERRAMENTAS) {
      expect(f.id).toMatch(/^[a-z0-9-]+$/);
      expect(f.origem.length).toBeGreaterThan(2);
    }
  });
});
