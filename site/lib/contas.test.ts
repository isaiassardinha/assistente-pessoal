import { describe, expect, it } from "vitest";
import { diasEntre, lerMes, limitesDoMes, nomeDoMes, resumirContas, situacaoDaConta, somarMes, vencimentoNoMes } from "./contas";

const hoje = "2026-11-18";
const conta = (vencimento: string, extra: Partial<Parameters<typeof situacaoDaConta>[0]> = {}) => ({
  descricao: "Luz",
  valor: 100,
  vencimento,
  status: "a_pagar" as const,
  ...extra,
});

describe("situação da conta", () => {
  it("atrasada, hoje, próxima e futura", () => {
    expect(situacaoDaConta(conta("2026-11-15"), hoje)).toEqual({
      situacao: "atrasada",
      texto: "Venceu há 3 dias",
    });
    expect(situacaoDaConta(conta("2026-11-17"), hoje).texto).toBe("Venceu ontem");
    expect(situacaoDaConta(conta("2026-11-18"), hoje).situacao).toBe("hoje");
    expect(situacaoDaConta(conta("2026-11-19"), hoje).texto).toBe("Vence amanhã");
    expect(situacaoDaConta(conta("2026-11-25"), hoje).texto).toBe("Vence em 7 dias");
    expect(situacaoDaConta(conta("2026-12-10"), hoje)).toEqual({
      situacao: "a_pagar",
      texto: "Vence 10/12",
    });
  });
  it("paga e ignorada", () => {
    expect(situacaoDaConta(conta("2026-11-10", { status: "paga", paga_em: "2026-11-09" }), hoje).texto).toBe("Paga em 09/11");
    expect(situacaoDaConta(conta("2026-11-10", { status: "ignorada" }), hoje).situacao).toBe("ignorada");
  });
});

describe("resumo", () => {
  it("soma a pagar, pagas, atrasadas e as sem valor", () => {
    const r = resumirContas(
      [
        conta("2026-11-10"),
        conta("2026-11-20", { valor: null }),
        conta("2026-11-25", { valor: 50.5 }),
        conta("2026-11-05", { status: "paga", valor: 300 }),
        conta("2026-11-06", { status: "ignorada", valor: 999 }),
      ],
      hoje,
    );
    expect(r).toEqual({
      aPagar: 150.5,
      semValor: 1,
      pagas: 300,
      atrasadas: 1,
      qtdAPagar: 3,
    });
  });
});

describe("meses", () => {
  it("limites, navegação e nome", () => {
    expect(limitesDoMes("2028-02")).toEqual({
      inicio: "2028-02-01",
      fim: "2028-02-29",
    });
    expect(somarMes("2026-12", 1)).toBe("2027-01");
    expect(somarMes("2026-01", -1)).toBe("2025-12");
    expect(nomeDoMes("2026-03")).toBe("março de 2026");
    expect(lerMes("2026-13", hoje)).toBe("2026-11");
    expect(lerMes("2027-01", hoje)).toBe("2027-01");
  });
  it("vencimento de conta fixa no mês", () => {
    expect(vencimentoNoMes("2026-02", 31)).toBe("2026-02-28");
    expect(vencimentoNoMes("2026-03", 5)).toBe("2026-03-05");
  });
  it("dias entre datas", () => {
    expect(diasEntre("2026-11-18", "2026-12-01")).toBe(13);
  });
});
