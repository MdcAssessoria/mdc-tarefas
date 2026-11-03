// Testes do "Enviar XML" (enviarXml) com o Supabase simulado: pasta do mês no fuso da organização, nome do arquivo,
// mensagens em português e limpeza do arquivo guardado quando o registro no banco falha.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CHAVE_NFE, PROC_NFE } from "./exemplosXml";
import type { NotaLida } from "./documentos";

const falso = vi.hoisted(() => ({
  upload: vi.fn(),
  remove: vi.fn(),
  rpc: vi.fn(),
  /** Quando preenchido, substitui o que o leitor de XML devolve (para simular nota sem chave). */
  notas: null as null | ((lidas: NotaLida[]) => NotaLida[]),
}));
vi.mock("./documentos", async (original) => {
  const real = await original<typeof import("./documentos")>();
  return { ...real, lerVariasNotas: (t: string) => (falso.notas ? falso.notas(real.lerVariasNotas(t)) : real.lerVariasNotas(t)) };
});
vi.mock("@/lib/supabase", () => ({
  supabase: () => ({
    storage: { from: () => ({ upload: falso.upload, remove: falso.remove }) },
    rpc: falso.rpc,
  }),
}));

import { enviarXml } from "./repositorio";

const arquivo = (texto: string) => ({ text: async () => texto }) as unknown as File;

beforeEach(() => {
  falso.upload.mockReset().mockResolvedValue({ data: {}, error: null });
  falso.remove.mockReset().mockResolvedValue({ data: [], error: null });
  falso.rpc.mockReset().mockResolvedValue({ data: null, error: null });
  falso.notas = null;
});
afterEach(() => vi.useRealTimers());

describe("enviarXml", () => {
  it("guarda na pasta do mês no fuso da organização (não em UTC)", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-12-01T01:30:00Z")); // ainda 30/11 em São Paulo
    const r = await enviarXml("org1", "cli1", arquivo(PROC_NFE), "America/Sao_Paulo");
    expect(r).toEqual({ enviadas: 1, erros: [] });
    const caminho: string = falso.upload.mock.calls[0][0];
    expect(caminho.startsWith(`org1/cli1/upload/2026/11/${CHAVE_NFE}-`)).toBe(true);
    expect(falso.rpc).toHaveBeenCalledWith("fis_registrar_upload", expect.objectContaining({ p: expect.objectContaining({ caminho }) }));
  });

  it('nota sem chave não vira arquivo "null-…"', async () => {
    falso.notas = (lidas) => lidas.map((n) => ({ ...n, chave: null as unknown as string }));
    await enviarXml("org1", "cli1", arquivo(PROC_NFE), "America/Sao_Paulo");
    const caminho: string = falso.upload.mock.calls[0][0];
    const nome = caminho.split("/").pop()!;
    expect(nome).not.toMatch(/^(null|undefined)?-/);
    expect(nome).toMatch(/^nota-1234-\d+\.xml$/);
  });

  it("falha ao guardar o arquivo: mensagem em português, sem texto técnico em inglês", async () => {
    falso.upload.mockResolvedValue({ data: null, error: { name: "StorageApiError", message: "new row violates row-level security policy" } });
    const r = await enviarXml("org1", "cli1", arquivo(PROC_NFE), "America/Sao_Paulo");
    expect(r.enviadas).toBe(0);
    expect(r.erros).toHaveLength(1);
    expect(r.erros[0]).toMatch(/^Nota 1234: não foi possível guardar o arquivo\./);
    expect(r.erros[0]).not.toMatch(/row-level|policy/);
    expect(falso.rpc).not.toHaveBeenCalled();
  });

  it("falha ao registrar no banco: apaga o arquivo guardado e explica em português", async () => {
    falso.rpc.mockResolvedValue({ data: null, error: { code: "23505", message: "duplicate key value violates unique constraint" } });
    const r = await enviarXml("org1", "cli1", arquivo(PROC_NFE), "America/Sao_Paulo");
    const caminho: string = falso.upload.mock.calls[0][0];
    expect(falso.remove).toHaveBeenCalledWith([caminho]);
    expect(r).toEqual({ enviadas: 0, erros: ["Nota 1234: Este registro já existe."] });
  });
});
