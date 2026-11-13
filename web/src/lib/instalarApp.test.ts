// Testa a escolha do passo a passo de instalação pelo aparelho e pelo navegador.
import { describe, expect, it } from "vitest";
import { abertoComoApp, navegadorIphone, plataforma } from "./instalarApp";

const SAFARI_IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1";
const CHROME_IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/131.0 Mobile/15E148 Safari/604.1";
const INSTAGRAM_IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 350.0";
const IPAD_COMO_MAC =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15";
const ANDROID = "Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Mobile Safari/537.36";
const WINDOWS = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36";

describe("plataforma", () => {
  it("iPhone, iPad (mesmo se apresentando como Mac), Android e computador", () => {
    expect(plataforma(SAFARI_IPHONE)).toBe("iphone");
    expect(plataforma(IPAD_COMO_MAC, 5)).toBe("iphone");
    expect(plataforma(IPAD_COMO_MAC, 0)).toBe("computador");
    expect(plataforma(ANDROID)).toBe("android");
    expect(plataforma(WINDOWS)).toBe("computador");
  });
});

describe("navegadorIphone", () => {
  it("separa Safari, Chrome e navegador de dentro de outro app", () => {
    expect(navegadorIphone(SAFARI_IPHONE)).toBe("safari");
    expect(navegadorIphone(CHROME_IPHONE)).toBe("chrome");
    expect(navegadorIphone(INSTAGRAM_IPHONE)).toBe("dentro_de_app");
  });
});

describe("abertoComoApp", () => {
  it("pelo modo de tela ou pela marca do iPhone", () => {
    expect(abertoComoApp(true)).toBe(true);
    expect(abertoComoApp(false, true)).toBe(true);
    expect(abertoComoApp(false, false)).toBe(false);
  });
});
