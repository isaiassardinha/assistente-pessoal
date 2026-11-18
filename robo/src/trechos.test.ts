import { describe, expect, it } from "vitest";
import { MAXIMO_TRECHOS, normalizarTexto, pareceEscaneado, quebrarEmTrechos } from "./trechos";

describe("quebrar em trechos", () => {
  it("texto curto vira um trecho só", () => {
    expect(quebrarEmTrechos("  A placa do carro é ABC1D23.  ")).toEqual(["A placa do carro é ABC1D23."]);
  });

  it("texto vazio não vira nada", () => {
    expect(quebrarEmTrechos(" \n\n ")).toEqual([]);
  });

  it("texto longo vira vários trechos, nenhum maior que o limite, sem perder nada", () => {
    const frases = Array.from({ length: 200 }, (_, i) => `Esta é a frase número ${i} do contrato.`);
    const texto = frases.join(" ");
    const trechos = quebrarEmTrechos(texto, 500, 100);
    expect(trechos.length).toBeGreaterThan(5);
    for (const t of trechos) expect(t.length).toBeLessThanOrEqual(500);
    // toda frase aparece em algum trecho
    for (const f of frases) expect(trechos.some((t) => t.includes(f))).toBe(true);
  });

  it("prefere cortar no fim do parágrafo", () => {
    const p1 = "a".repeat(300) + ".";
    const p2 = "b".repeat(300) + ".";
    const trechos = quebrarEmTrechos(`${p1}\n\n${p2}`, 500, 50);
    expect(trechos[0]).toBe(p1);
  });

  it("palavra gigante sem espaço não trava", () => {
    const trechos = quebrarEmTrechos("x".repeat(5000), 1000, 100);
    expect(trechos.length).toBeGreaterThanOrEqual(5);
  });

  it("tem um limite de trechos por documento", () => {
    const trechos = quebrarEmTrechos("palavra ".repeat(400_000), 1500, 200);
    expect(trechos.length).toBe(MAXIMO_TRECHOS);
  });

  it("normaliza espaços e linhas", () => {
    expect(normalizarTexto("a \t b\r\n\n\n\nc")).toBe("a b\n\nc");
  });
});

describe("PDF escaneado", () => {
  it("quase sem texto por página = escaneado", () => {
    expect(pareceEscaneado("  \n 12 ", 3)).toBe(true);
    expect(pareceEscaneado("Contrato de locação ".repeat(30), 1)).toBe(false);
  });
});
