import { describe, expect, it } from "vitest";
import { emReais, formatarDolar, formatarTokens, resumirUso } from "./consumo";

const l = (dia: string, tipo: string, custo: number, usuario: string | null = "u1") => ({
  dia,
  usuario_id: usuario,
  tipo,
  chamadas: 2,
  tokens_entrada: 1000,
  tokens_saida: 100,
  custo_usd: custo,
});

describe("resumo do consumo", () => {
  it("totais, hoje, por tipo, por pessoa e previsão", () => {
    const r = resumirUso(
      [l("2026-11-01", "conversa", 0.1), l("2026-11-10", "leitura", 0.2, "u2"), l("2026-11-10", "autoteste", 0.0, null)],
      "2026-11-10",
      "2026-11",
    );
    expect(r.total.custo).toBeCloseTo(0.3, 6);
    expect(r.total.chamadas).toBe(6);
    expect(r.hoje.custo).toBeCloseTo(0.2, 6);
    expect(r.porTipo[0][0]).toBe("leitura");
    expect(r.porPessoa.map(([k]) => k)).toContain("sistema");
    // 0,30 em 10 dias -> 0,90 em 30 dias
    expect(r.previsao).toBeCloseTo(0.9, 6);
  });
  it("mês passado não projeta", () => {
    const r = resumirUso([l("2026-10-05", "conversa", 1)], "2026-11-10", "2026-10");
    expect(r.previsao).toBeCloseTo(1, 6);
  });
  it("formatos", () => {
    expect(formatarDolar(0.004)).toBe("menos de US$ 0,01");
    expect(formatarDolar(1.5)).toBe("US$ 1,50");
    expect(formatarTokens(1_250_000)).toBe("1,3 mi");
    expect(formatarTokens(3400)).toBe("3,4 mil");
    expect(emReais(1, 5.5)).toBe("≈ R$ 5,50");
    expect(emReais(1, null)).toBe("");
  });
});
