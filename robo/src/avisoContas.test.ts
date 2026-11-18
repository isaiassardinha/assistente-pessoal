import { describe, expect, it } from "vitest";
import { montarAvisoContas } from "./avisoContas";

describe("aviso de contas", () => {
  it("separa atrasadas, de hoje e próximas", () => {
    const msg = montarAvisoContas(
      [
        {
          descricao: "Luz",
          valor: 287.4,
          vencimento: "2026-11-15",
          tipo: "atrasada",
        },
        {
          descricao: "Aluguel",
          valor: 3000,
          vencimento: "2026-11-18",
          tipo: "hoje",
        },
        {
          descricao: "Internet",
          valor: null,
          vencimento: "2026-11-21",
          tipo: "antes",
        },
      ],
      "2026-11-18",
    );
    expect(msg).toContain("Luz: R$ 287,40 (venceu há 3 dias, em 15/11)");
    expect(msg).toContain("Vencem hoje:*\n• Aluguel: R$ 3.000,00");
    expect(msg).toContain("Internet: valor a definir (vence sáb, 21/11)");
    expect(msg).toContain('"paguei luz"');
    expect(msg.indexOf("Luz")).toBeLessThan(msg.indexOf("Aluguel"));
  });
  it("só o que tem", () => {
    const msg = montarAvisoContas(
      [
        {
          descricao: "Água",
          valor: 80,
          vencimento: "2026-11-17",
          tipo: "atrasada",
        },
      ],
      "2026-11-18",
    );
    expect(msg).toContain("venceu ontem");
    expect(msg).not.toContain("Vencem hoje");
  });
});
