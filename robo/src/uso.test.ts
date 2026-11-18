import { describe, expect, it } from "vitest";
import { custoUsd, estimarTokens, somarUso, usoDaResposta } from "./uso";

describe("consumo da IA", () => {
  it("custo pelo preço de tabela", () => {
    // 1 milhão de entrada + 1 milhão de saída no Flash-Lite = 0,25 + 1,50
    expect(custoUsd("gemini-3.1-flash-lite", { entrada: 1_000_000, saida: 1_000_000 })).toBeCloseTo(1.75, 6);
    // áudio custa o dobro do texto na entrada
    expect(custoUsd("gemini-3.1-flash-lite", { entrada: 1_000_000, saida: 0, audio: 1_000_000 })).toBeCloseTo(0.5, 6);
    expect(custoUsd("gemini-embedding-2", { entrada: 1_000_000, saida: 0 })).toBeCloseTo(0.2, 6);
  });

  it("lê os tokens da resposta (raciocínio conta como saída)", () => {
    expect(
      usoDaResposta({
        usageMetadata: {
          promptTokenCount: 1200,
          candidatesTokenCount: 80,
          thoughtsTokenCount: 40,
          promptTokensDetails: [
            { modality: "TEXT", tokenCount: 200 },
            { modality: "AUDIO", tokenCount: 1000 },
          ],
        },
      }),
    ).toEqual({ entrada: 1200, saida: 120, audio: 1000 });
    expect(usoDaResposta(undefined)).toEqual({ entrada: 0, saida: 0, audio: 0 });
  });

  it("soma rodadas e estima tokens de texto", () => {
    expect(somarUso({ entrada: 10, saida: 1 }, { entrada: 5, saida: 2 })).toEqual({ entrada: 15, saida: 3, audio: 0, chamadas: 2 });
    expect(estimarTokens(["abcd", "abcdefgh"])).toBe(3);
  });
});
